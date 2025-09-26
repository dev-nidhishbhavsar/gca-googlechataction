// const SCOPE = 'https://www.googleapis.com/auth/chat.bot';
const SCOPE = 'https://www.googleapis.com/auth/chat.bot https://www.googleapis.com/auth/chat.spaces https://www.googleapis.com/auth/chat.memberships.app';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';


/**
 *
 * @param {string} service_account_email
 * @param {string} prv_key
 * @param {"RS256"} algorithm
 * @param {string} scope
 * @param {number} expiryPeriodInSecs
 * @param {string} [impersonateUser] - Email to impersonate (for domain-wide delegation)
 * @returns {string}
 */
function createJwt(service_account_email, prv_key, algorithm, scope, expiryPeriodInSecs, impersonateUser) {
  const token = {
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiryPeriodInSecs,
    aud: 'https://oauth2.googleapis.com/token',
    scope: scope,
    iss: service_account_email,
  };

  // Add subject for domain-wide delegation (impersonation)
  // if (impersonateUser) {
  //   token.sub = impersonateUser;
  //   log('[DELEGATION] Using domain-wide delegation to impersonate:', impersonateUser);
  // }

  return crypto.create_jwt(token, algorithm, prv_key);
}

/**
 *
 * @param {string} jwtToken
 * @returns {Promise<{access_token: string}>}
 */
function getToken(jwtToken) {
  return fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: JSON.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtToken,
    }),
  }).then(function (response) {
    if (response.status != 200) {
      const errorInfo = response.json();
      throw {
        status_code: response.status,
        message: errorInfo,
      };
    } else {
      return /** @type {{access_token: string}} */ (response.json());
    }
  });
}

/**
 * Get access token using service account authentication with domain-wide delegation
 * @returns {Promise<string>}
 */
function getAccessToken(secrets) {
  // const impersonateUser = secrets["domain_admin_email"];

  const jwt = createJwt(
    secrets["google_chat_client_email"],
    secrets["google_chat_private_key"],
    "RS256",
    SCOPE,
    3600, // 1 hour expiry
    // impersonateUser // Impersonate domain admin
  );

  return getToken(jwt).then(function (tokenResponse) {
    log('token response ', tokenResponse)
    return tokenResponse.access_token;
  });
}

/**
 * List all available spaces and check app membership status
 * @param {string} accessToken 
 * @returns {Promise}
 */
function listAvailableSpaces(accessToken) {
  log('[SPACELIST] Starting to list all available spaces...');

  // First, get all spaces the app has access to
  const spacesUrl = 'https://chat.googleapis.com/v1/spaces';

  return fetch(spacesUrl, {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    }
  }).then(function (response) {
    log('[SPACELIST] Spaces list response status:', response.status);

    if (!response.ok) {
      log('[ERROR] Failed to list spaces:', response.statusText);
      throw new Error(`Failed to list spaces: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }).then(function (spacesData) {
    const spaces = spacesData.spaces || [];
    log('[SPACELIST] Total spaces found:', spaces.length);

    if (spaces.length === 0) {
      log('[WARNING] No spaces found that the app has access to');
      return [];
    }

    // Log basic space information
    spaces.forEach(function (space, index) {
      log(`[SPACE${index + 1}] Name: ${space.name}, Display Name: ${space.displayName || 'N/A'}, Type: ${space.type || 'N/A'}`);
    });

    return spaces;
  }).catch(function (error) {
    log('[ERROR] Error listing spaces:', error.message);
    return [];
  });
}

/**
 * Replace placeholders in message text with actual values
 * @param {string} messageTemplate - Message with placeholders like "Hello {name}"
 * @param {object} placeholders - Key-value pairs for replacement, e.g., {name: "John", platformName: "ClearBlade"}
 * @returns {string} - Message with placeholders replaced
 */
function replacePlaceholders(messageTemplate, placeholders) {
  if (!placeholders || typeof placeholders !== 'object') {
    log('[WARNING] No placeholders provided, using message as-is');
    return messageTemplate;
  }

  let processedMessage = messageTemplate;

  // Replace each placeholder
  Object.keys(placeholders).forEach(function (key) {
    const placeholder = `{${key}}`;
    const value = placeholders[key];

    // Replace all occurrences of this placeholder
    processedMessage = processedMessage.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);

    log(`[REPLACE] Replaced ${placeholder} with "${value}"`);
  });

  log('[FINALMESSAGE] Final message:', processedMessage);
  return processedMessage;
}

/**
 * Send message to Google Chat using official Chat API with service account
 * As documented in Google's Chat API guide
 * @param {string} messageTemplate - The message template with placeholders like "Hello {platformName}"
 * @param {object} placeholders - Optional object with placeholder values, e.g., {platformName: "ClearBlade", version: "1.0"}
 */
function sendGoogleChatMessage(message, channelId, secrets) {
  return new Promise(function (resolve, reject) {
    if (!channelId) {
      reject(new Error("google_chat_space_name not found in SECRETS"));
      return;
    }

    getAccessToken(secrets)
      .then(function (accessToken) {
        log('[ACCESSTOKEN] Got access token with domain-wide delegation');
        return accessToken;
        // // List all available spaces 
        // return listAvailableSpaces(accessToken)
        //   .then(function (spaces) {
        //     log('[SPACELIST] Space listing completed, proceeding with message sending');
        //     return accessToken; // Pass token to next step
        //   })
        //   .catch(function (listError) {
        //     log('[WARNING] Space listing failed, continuing with message sending:', listError.message);
        //     return accessToken; // Continue even if space listing fails
        //   });
      })
      .then(function (accessToken) {
        // Process placeholders in the message template
        // const processedMessage = replacePlaceholders(messageTemplate, placeholders);

        // Now send the actual message
        const messageData = {
          text: message
        };

        const options = {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(messageData)
        };

        const url = `https://chat.googleapis.com/v1/spaces/${channelId}/messages`;
        log('[SENDMESSAGE] Sending message to:', url);

        return fetch(url, options);
      })
      .then(function (response) {
        log('[RESPONSE] Message Response Status:', response.status)
        if (!response.ok) {
          throw new Error(`Google Chat API request failed with status ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(function (data) {
        log("Message sent to Google Chat successfully: " + JSON.stringify(data));
        resolve(data);
      })
      .catch(function (error) {
        console.error("Error sending message to Google Chat: " + error);
        reject(error);
      });
  });
}


/**
 * Main function to send a message with placeholder support using service account authentication
 * @param {string} messageTemplate - Message template with placeholders like "Hello {name}"
 * @param {object} placeholders - Optional object with placeholder values
 */
function sendMessage(message, channelId, secrets) {
  return sendGoogleChatMessage(message, channelId, secrets);
}

/**
 * Type: Stream Service
 * Description: A service that does not have an execution timeout which allows for infinite execution of logic.
 * @param {CbServer.BasicReq} req
 * @param {string} req.systemKey
 * @param {string} req.systemSecret
 * @param {string} req.userEmail
 * @param {string} req.userid
 * @param {string} req.userToken
 * @param {boolean} req.isLogging
 * @param {[id: string]} req.params
 * @param {CbServer.Resp} resp
 */

function stream_service_google_chat_action(req, resp) {
  const client = new MQTT.Client();
  const TOPIC = "component/action/custom/send_google_chat/request";

  client
    .subscribe(TOPIC, function (topic, message) {
      console.log(
        "received message on topic " + topic + ": " + message.payload
      );
      processMessage(message, topic);
    })
    .catch(function (reason) {
      resp.error("failed to subscribe: " + reason.message);
    });

  function processMessage(msg, topic) {
    const payload = JSON.parse(msg.payload);
    // TODO: Need to cheange secret name and also add this process in README.md
    ClearBladeAsync.Secret()
      .read("secret")
      .then(function (secrets) {
       
        if(!secrets || !secrets.google_chat_client_email || !secrets.google_chat_private_key) {
          log("failed to parse secrets: " + JSON.stringify(secrets));
          const errorRes = {
            success: false,
            payload,
            error: "failed to parse secrets: " + JSON.stringify(secrets),
          };
          return client.publish(
            "component/action/custom/send_google_chat/response",
            JSON.stringify(errorRes)
          );
        }

        const configString = payload.action.config;
        const config = JSON.parse(configString);
        const channelId = config.space_id;
        const message = payload.defaults.fullMessage;

        sendMessage(message, channelId, secrets)
          .then(function (result) {
            log(
              "SUCCESS: Message sent successfully - " + JSON.stringify(result)
            );
            const successRes = {
              success: true,
              payload,
            };
            client
              .publish(
                "component/action/custom/send_google_chat/response",
                JSON.stringify(successRes)
              )
              .then(
                function () {
                  log("successfully published message");
                },
                function (reason) {
                  log("failed to publish message : " + reason.message);
                }
              );
          })
          .catch(function (error) {
            log("ERROR ", error);
            const errorRes = {
              success: false,
              payload,
              error: error.message,
            };
            client
              .publish("component/action/custom/send_google_chat/response", errorRes)
              .then(
                function () {
                  log("Error successfully published message");
                },
                function (reason) {
                  log("failed to publish message : " + reason.message);
                }
              );
          });
      })
      .catch(function (err) {
        log("Failed to read secrets: " + err.message);
        const errorRes = {
          success: false,
          payload,
          error: "Failed to read secrets: " + err.message,
        };
        client
          .publish(
            "component/action/custom/send_google_chat/response",
            JSON.stringify(errorRes)
          )
          .then(
            function () {
              log("Error successfully published message");
            },
            function (reason) {
              log("failed to publish message : " + reason.message);
            }
          );
      });

    // DEBUG MESSAGE

    // Examples of process message tasks:
    // - Storing message in a collection: https://github.com/ClearBlade/native-libraries/blob/master/clearblade.md#collectioncreatenewitem-callback
    // - Process and publish to another topic: https://github.com/ClearBlade/native-libraries/blob/master/clearblade.md#messagepublishtopic-payload
    // - Update a Device State: https://github.com/ClearBlade/native-libraries/blob/master/clearblade.md#deviceupdatequery-changes-callback
  }
}
