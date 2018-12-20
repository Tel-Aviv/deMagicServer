var fetch = require("node-fetch");
var express = require("express");
var proxyAgent = require("https-proxy-agent");
var config = require("./../config.json");
var casual = require("casual");

const baseUrl = config.congnitiveUrl;
const listItems = [];
let counter = 0;

//get all face list and save it locally
fetch(
  `${baseUrl}largefacelists/${
    config.largeFaceListId
  }/persistedfaces?start=0&top=1000`,
  {
    method: "GET",
    //agent: new proxyAgent(config.proxyUrl),
    headers: {
      "Ocp-Apim-Subscription-Key": config.subscriptionKey
    }
  }
)
  .then(res => res.json())
  .then(json => {
    json.map(item => {
      const userData = JSON.parse(item.userData);
      listItems.push({
        id: item.persistedFaceId,
        //  url: userData.url,
        phoneNumber: userData.phoneNumber,
        name: userData.firstName,
        tid: userData.tid,
        sent: false
      });
    });
  })
  .catch(err => {
    console.error(err);
  });

// express rest api
const app = express();

app.post("/test", (req, res) => {
  let body = {
    source: "Tlv Conf",
    destination: ["+972543307026"],
    text: `${casual.word} `
  };
  fetch(config.actionerUrl, {
    method: "POST",
    //agent: new proxyAgent(config.proxyUrl),
    headers: {
      //   'Ocp-Apim-Subscription-Key': config.smsSubKey,
      Authorization:
        "Basic OTkyZDU1MjgtOGM3Zi00ODBmLThjNzktZWFjYmY3YTJhZTMyOjAyYWFlMTllLWFmYzQtNDNhMi1hZDY1LTFkMWI0NjBiOGIwMQ==",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }).then(resp => {
    res.send(200, resp);
  });
});

app.post("/face/detect", (req, res) => {
  if (req.headers["access-key"] !== "conf2018") {
    return res.status(403).send({
      success: "false",
      message: "no access key was supplied"
    });
  }
  let requestId = ++counter;
  console.time("request: " + requestId);
  console.timeLog("request: " + requestId, "request received");

  fetch(`${baseUrl}detect?returnFaceId=true&returnFaceLandmarks=false`, {
    method: "POST",
    //agent: new proxyAgent(config.proxyUrl),
    headers: {
      "Ocp-Apim-Subscription-Key": config.subscriptionKey,
      "Content-Type": "application/octet-stream"
    },
    body: req
  })
    .then(resp => resp.json())
    .then(faces => {
      console.timeLog(
        "request: " + requestId,
        "Detect " + faces.length + " face(s)"
      );

      if (faces.length > 0) {
        for (var i in faces) {
          const faceId = faces[i].faceId;

          console.timeLog(
            "request: " + requestId,
            `Trying similariry for ${faceId}`
          );

          body = {
            faceId: faceId,
            largeFaceListId: config.largeFaceListId,
            maxNumOfCandidatesReturned: 1,
            mode: "matchPerson"
          };

          fetch(`${baseUrl}findsimilars`, {
            method: "POST",
            //agent: new proxyAgent(config.proxyUrl),
            headers: {
              "Ocp-Apim-Subscription-Key": config.subscriptionKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          })
            .then(resp => resp.json())
            .then(json => {
              console.timeLog(
                "request: " + requestId,
                `Returned from similarity with ${json.length} items`
              );

              if (json && json.length > 0) {
                if (json[0].confidence > config.confidence) {
                  console.timeLog(
                    "request: " + requestId,
                    "Found similar face with " +
                      json[0].confidence +
                      " confidence"
                  );

                  return listItems.find(item => {
                    return item.id == json[0].persistedFaceId;
                  });
                } else {
                  console.timeLog(
                    "request: " + requestId,
                    `Found with low confidence: ${json[0].confidence}`
                  );
                  return null;
                }
              } else {
                console.timeLog(
                  "request: " + requestId,
                  `Similar face not found`
                );
                return null;
              }
            })
            .then(foundJson => {
              if (foundJson) {
                console.timeLog(
                  "request: " + requestId,
                  "Found user: " + foundJson.tid
                );

                if (foundJson.sent) {
                  console.timeLog(
                    "request: " + requestId,
                    `SMS is already sent to ${foundJson.phoneNumber}`
                  );
                  return;
                }

                body = {
                  source: "Tlv Conf",
                  destination: ["+972546592374"],
                  text: `${
                    foundJson.name
                  } שלום, הנה כרטיס הכניסה שלך לכנס אגף המחשוב 2018: ${
                    config.ticketUrl
                  }${foundJson.id}&sid=${casual.letter}`
                };

                fetch(config.actionerUrl, {
                  method: "POST",
                  //agent: new proxyAgent(config.proxyUrl),
                  headers: {
                    //   'Ocp-Apim-Subscription-Key': config.smsSubKey,
                    Authorization: "Basic OTkyZDU1MjgtOGM3Zi00ODBmLThjNzktZWFjYmY3YTJhZTMyOjAyYWFlMTllLWFmYzQtNDNhMi1hZDY1LTFkMWI0NjBiOGIwMQ==",
                      "Content-Type": "application/json"
                  },
                  body: JSON.stringify(body)
                })
                  .then(resp => {
                    const found = listItems.find(item => {
                      return item.id == foundJson.id;
                    });
                    if (found) {
                      //found.sent = true;
                      console.timeLog(
                        "request: " + requestId,
                        "sms sent to: " + foundJson.phoneNumber
                      );
                    }
                    console.timeEnd("request: " + requestId);
                  })
                  .catch(err => {
                    console.error(err);
                  });
              }
            })
            .catch(err => {
              console.error(err);
            });
        }
      }

      res.status(202).send();
    })
    .catch(err => {
      console.error(err);
      console.timeEnd("request: " + requestId);
    });
});

const PORT = process.env.PORT || config.port;

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});
