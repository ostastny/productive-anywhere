const https = require('https');
const azure = require('azure-storage');
const {readFileSync} = require('fs');
const {google} = require('googleapis');

const SLACK_TOKEN = process.env["slack_token"];

const SCOPES = ['https://www.googleapis.com/auth/admin.directory.group.member.readonly',
                'https://www.googleapis.com/auth/admin.directory.group.member',
                'https://www.googleapis.com/auth/admin.directory.group.readonly',
                'https://www.googleapis.com/auth/admin.directory.group'];

// Load client secrets from a local file.
const payloadRaw = readFileSync('./credentials.json', 'utf-8');
 
const client = google.auth.fromJSON(JSON.parse(payloadRaw));
client.scopes = SCOPES;
// Directory API, you need to impersonate an admin in the domain using domain-wide delegation. 
//See https://developers.google.com/identity/protocols/oauth2/service-account#delegatingauthority for details.
client.subject = process.env["domain_admin"];


  
var tableName;
var tableSvc = (() => {
    const uri = new URL(process.env["storage_token_mapping"]);
    const host = uri.host;
    const sasToken = uri.search;        
    tableName = uri.pathname.substring(1);

    return azure.createTableServiceWithSas(host, sasToken);
})();

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    // Required to validate the endpoint when configuring Slack bot
    if(req.body && req.body.challenge)
    {
        context.log("Challenge received " + req.body.challenge);
        context.res = { status: 200, body: JSON.stringify({challenge: req.body.challenge})};
        return;
    }

    if (req.body && req.body.event && req.body.event.channel) {
        context.log(`Looking up mapping for team ${req.body.event.team} channel ${req.body.event.channel}`);
           
        let mapping = await queryMapping(req.body.event.team, req.body.event.channel);
        mapping = mapping && mapping.entries.reduce((l, c) => (l.push(c.GroupId._),l), []);

        if(!mapping || !mapping.length)
        {
            context.log(`Mapping for team ${req.body.event.team} channel ${req.body.event.channel} not found`);
            context.res = {
                status: 200, 
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ok: false, error: `Mapping for team ${req.body.event.team} channel ${req.body.event.channel} not found` })
            };
            return;
        }
        context.log(`Mapping to [${mapping.join(',')}]`);

        
        context.log(`Looking up user ${req.body.event.user}`);
        const userInfo = await lookupUser(context, req.body.event.user);

        try
        {
            await Promise.all(mapping.map((mapping) => insertMember(client, context, mapping, userInfo.user.profile.email)));
       
            context.res = {
                status: 200, 
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ok: true, groups: mapping })
            };
        }
        catch(err)
        {
            context.log(err);

            context.res = {
                status: 200, 
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ok: false, message: err.message && err.message })
            };
        }
    }
    else {
        context.res = {
            status: 400,
            headers: {
                'Content-Type': 'application/json'
            },
            body:  JSON.stringify({ ok: false, message:  "Please pass a name on the query string or in the request body" })
        };
    }
};


/**
 * Lookup Slack user information
 *
 * @param {any} context Azure Function Execution context
 * @param {string} user Unique identifier of a Slack user
 */
async function lookupUser(context, user) {
    return new Promise(async function(resolve, reject) {
        const options = {
            hostname: 'slack.com',
            path: `/api/users.info?user=${user}`,
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + SLACK_TOKEN,
                'Accept': 'application/json; charset=utf-8'
            }
        };

        var req = https.request(options, (resp) => {
            var body = [];

            if (resp.statusCode < 200 || resp.statusCode >= 300) {
                return reject(resp.statusCode);
            }

            resp.on('data', (chunk) => {
                body.push(chunk);
            });

            resp.on('end', () => {
                try {
                    body = JSON.parse(Buffer.concat(body).toString());
                } catch(e) {
                    reject(e);
                }
                resolve(body);
            });

        }).on("error", (err) => {
            context.log("Error: " + err.message);
            reject(err);
        });

        req.end();
    });
}


/**
 * Query Mapping 
 *
 * @param {string} channelId Slack Team Id
 * @param {string} channelId Slack Channel Id
 */
async function queryMapping(teamId, channelId) {
    var query = new azure.TableQuery().where(`PartitionKey eq '${teamId}' and RowKey eq '${channelId}'`); 
    return new Promise(function(resolve, reject) {
        tableSvc.queryEntities(tableName, query, null, function(error, result){
            if(!error) 
                resolve(result);
            else
                reject(error);
        });
    });
}


/**
 * Insert new member to a group
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {any} context Azure Function Execution context
 * @param {string} groupKey Unique identifier of a Google Group
 * @param {string} email User email
 */
function insertMember(auth, context, groupKey, email) {
    let payload = {
        email: email,
        role:"MEMBER"
    };

    return new Promise((resolve, reject) => {
        const service = google.admin({version: 'directory_v1', auth});
        service.members.insert({
            groupKey: groupKey,
            resource: payload
        }, (err, res) => {
            if (err) 
            {
                context.log('The API returned an error:', err.message);
                reject(err);
            }

            resolve(res && res.date && res.data.member);
        });
    });
}