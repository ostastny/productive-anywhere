const azure = require('azure-storage');
const {readFileSync} = require('fs');
const {google} = require('googleapis');
const Qs = require('qs');

       
var tableName;
var tableSvc = (() => {
    const uri = new URL(process.env["storage_token_mapping"]);
    const host = uri.host;
    const sasToken = uri.search;        
    tableName = uri.pathname.substring(1);

    return azure.createTableServiceWithSas(host, sasToken);
})();

const SCOPES = ['https://www.googleapis.com/auth/admin.directory.group.member.readonly',
                'https://www.googleapis.com/auth/admin.directory.group.member',
                'https://www.googleapis.com/auth/admin.directory.group.readonly',
                'https://www.googleapis.com/auth/admin.directory.group'];

 // Load client secrets from a local file.
 const payloadRaw = readFileSync('./credentials.json', 'utf-8');
 
 const client = google.auth.fromJSON(JSON.parse(payloadRaw));
 client.scopes = SCOPES;
 //For Directory API you need to impersonate an admin in the domain using domain-wide delegation. 
 //See https://developers.google.com/identity/protocols/oauth2/service-account#delegatingauthority for details.
 client.subject = process.env["domain_admin"];

 

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    const payload = Qs.parse(req.body);
    

    if(!payload.text)
    {
        context.log(`Invalid payload, text not provided ${JSON.stringify(payload)}`);
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                response_type: 'ephemeral',
                channel: req.channel_id,
                text: 'You must provide mailing group in /link command :face_palm:',
              })
        };
        return;
    }

    
    let groupInfo;
    try
    {
        context.log(`Looking up group ${payload.text}`);
        groupInfo = await retrieveGroup(client, context, payload.text); 

        if (groupInfo) {
            context.log(`Peristing mapping between team ${payload.team_id}, channel ${payload.channel_id} and group ${payload.text}`)
            await persistMapping(payload.team_id, payload.channel_id, groupInfo.id, payload.channel_name, groupInfo.name);
            context.log('Success')
        }
        else {
            context.log(`Could not find group ${payload.text}`);
        }
    } 
    catch(err) 
    {
        context.log(err);
    }


    if (groupInfo) {
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                response_type: 'in_channel',
                channel: payload.channel_id,
                text: `Group *${payload.channel_name}* is now linked with *${groupInfo.name}* :+1:`,
              })
        };
    }
    else {
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                response_type: 'ephemeral',
                channel: payload.channel_id,
                text: 'Could not find mailing list ' + payload.text,
              })
        };
    }
};


/**
 * Get group info
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {any} context Azure Function Execution context
 * @param {string} groupKey Unique identifier of a Google Group
 */
function retrieveGroup(auth, context, groupKey) {
    return new Promise((resolve, reject) => {
        const service = google.admin({version: 'directory_v1', auth});
        service.groups.get({
            groupKey: groupKey,
        }, (err, res) => {
            if (err) 
            {
             context.log('The API returned an error:', err.message);
             reject(err);
            }

            resolve(res && res.data);
        });
    });
}


/**
 * Persist mapping between Slack Channel and Google Email Group
 *
 * @param {string} teamId Unique identifier of Slack Workspace
 * @param {string} channelId Unique identifier of Slack channel
 * @param {string} groupId Unique identifier of Google Email Group
 * @param {string} channelName Slack channel name
 * @param {string} groupName Google group name
 */
async function persistMapping(teamId, channelId, groupId, channelName, groupName) {
    var payload = {
        PartitionKey : {'_': teamId, '$':'Edm.String'},
        RowKey: {'_': channelId, '$':'Edm.String'},
        GroupId: {'_': groupId, '$':'Edm.String'},
        GroupName: {'_': groupName, '$':'Edm.String'},
        ChannelName: {'_': channelName, '$':'Edm.String'}
    };
    return new Promise(function(resolve, reject) {
        tableSvc.insertEntity(tableName, payload, function(error){
            if(!error) 
                resolve(result);
            else
                reject(error);
        });
    });
}