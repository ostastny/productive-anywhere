# Slack to Google Email Group member sync

Set of erverless backend micro-services to provide sync 
of users between Slack public and **private** channels and Google (GSuite) email groups


## How to use

Easy as 1-2-3

1. Invite your app to the private channel with `/invite @gsuite_group_sync`
![](./images/screen04.png)
2. Link the channel to your Google Group with `/link mailing-list@your-org.com` 
![](./images/screen06.png)
3. **You are done!** Now all new members added to the group will be automatically added as members to the group of choice in Google Directory
![](./images/screen07.png)


## Prerequisites

1. GSuite account
2. Slack workspace
3. Azure account to run the backend
4. *Optional*: Slack Plus or Enterprise plan to setup user provisioning https://support.google.com/a/answer/6399782?hl=en

## Installation

### GSuite

1. In console.cloud.google.com, go to APis & Services > Credentials. Create Service Account. Grant Project - Viewer role and Enable Domain wide delegation. 
2. Click Create Key and choose JSON format. Download the file.
3. Note account Unique ID.
4. In admin.google.com, go to Security > Advanced Settings > Manage API Client Access and add new new Authorized API client, with ID from step 2 and following 4 scopes (comma separated)
- https://www.googleapis.com/auth/admin.directory.group
- https://www.googleapis.com/auth/admin.directory.group.member
- https://www.googleapis.com/auth/admin.directory.group.member.readonly
- https://www.googleapis.com/auth/admin.directory.group.readonly


### Azure functions

1. Clone this repository
2. Create your Azure Function resource in Azure portal, use appropriate plan to provide required resiliency and availability
3. Create Azure Storage Account and inside one Storage Table to hold the mapping information
4. Configure properties

| Property | Description | Example | 
| ----------- | ----------- | ----------- |
| AzureWebJobsStorage | Azure Storage account connection string | DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net| 
| storage_token_mapping | SAS Token to access Storage Table created in step 3 | https://<...>.table.core.windows.net/mapping?st=2020-05-19T06%3A33%3A43Z&se=2021-06-02T06%3A33%3A00Z&sp=rau&sv=2018-03-28&tn=mapping&sig=C1abCIWj%2Bk6JWbR4hY9UjDV0eQday%2BiV%2BrR8aJrWZuM%3D |
| slack_token | Slack App **OIDC** token | xoxp-1254828635616-1143614540049-1144448022673-ecfd5218f9b24a7708937e3e850c5d7f |
| domain_admin | For Directory API, you need to impersonate an admin in the domain using domain-wide delegation. | ondrej@productive-anywhere.com |

5. Create file credentials.json in root of the functions folder with content of key file from GSuite > Step 2 above.
5. Deploy functions via `func azure functionapp publish your-functions-resource`
5. Note the endpoint URL

### Slack

1. Create new Slack app
2. Give it app features and functionality
![](./images/screen03.png)
3. Add following scopes:

- channels:read
- commands
- groups:read
- groups:write
- im:read
- im:write
- mpim:read
- mpim:write
- users:read
- users:read.email

3. Under Event Subscriptions, put in Request URL for your Azure endpoint from above and append /api/listen and subscribe to member_joined_channel
![](./images/screen02.png)
4. Add new slash command, for URL use the Azure endpoint and append /api/link
![](./images/screen01.png)
5. Install app to your workspace



