/**
 * Type: Micro Service
 * Description: Install action service for installing the IA entities 
 * Runs as: IA User
 * @param {CbServer.BasicReq} req
 * @param {string} req.systemKey
 * @param {string} req.systemSecret
 * @param {string} req.userEmail
 * @param {string} req.userid
 * @param {string} req.userToken
 * @param {boolean} req.isLogging
 * @param {CbServer.Resp} resp
 */

function c1756114603967_install(req, resp) {
  /** @type {entity_id: string, component_id: string, mfe_settings: Record<string, unknown>} */
  const params = req.params;
  const systemKey = req.systemKey;
  const userToken = req.userToken;
  
  // Define the action type data
  const actionTypeData = {
    "name": "actionTypes.create",
    "body": {
      "item": {
        "id": "send_google_chat5",
        "label": "Send Google Chat Message",
        "schema": JSON.stringify([
          {
            "displayName": "Space ID",
            "name": "space_id",
            "input": "text",
            "allow_multiple": false,
            "required": false,
            "uuid": "4df472ec-faad-4236-9d13-2a9abbe0a4bb"
          },
          {
            "displayName": "Message",
            "name": "message",
            "input": "textarea",
            "allow_multiple": false,
            "required": false,
            "uuid": "25bb09f9-48f0-4537-9541-3a8023095344"
          }
        ])
      },
      "groupIds": ["default"]
    }
  };
  
  // Make API call to create action type
  const apiUrl = `https://community.clearblade.com/api/v/1/code/${systemKey}/createTableItems?id=actionTypes.create`;

  log('API URL', apiUrl);
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ClearBlade-UserToken': userToken
    },
    body: JSON.stringify(actionTypeData)
  };
  
  fetch(apiUrl, options)
    .then(function(response) {
      log('Response ', JSON.stringify(response));
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(function(data) {
      log('Action type created successfully:', JSON.stringify(data));
      resp.success('Setup completed successfully - Action type created');
    })
    .catch(function(error) {
      log('Error creating action type:', error);
      resp.error('Setup failed: ' + error.message);
    });
}