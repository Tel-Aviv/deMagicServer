var fetch = require("node-fetch");
var express = require("express");
var proxyAgent = require("https-proxy-agent");
var config = require("./../config.json");

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
        phoneNumber: userData.phoneNumber,
        name: userData.firstName + " " + userData.lastName,
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

app.get("/", (req, res) => {
  res.status(200).send({
    success: "true",
    message: "success"
  });
});

app.post("/face/detect", (req, res) => {
  if (req.headers["access-key"] !== "conf2018") {
    return res.status(403).send({
      success: "false",
      message: "no access key was supplied"
    });
  }
  let localCounter = ++counter;
  console.time("request: " + localCounter);
  console.timeLog("request: " + localCounter, "request recived");

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
    if (faces.length > 0) {
      console.timeLog("request: " + localCounter, "Detect face");
      for (var i in faces) {
        const faceId = faces[i].faceId;

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
            if (json && json.length > 0) {
              console.timeLog("request: " + localCounter, "Found simlar face");
              return listItems.find(item => {
                return item.id == json[0].persistedFaceId;
                
              });
            }
          })
          .then(foundJson => {
            if (foundJson /*&& !foundJson.sent*/ ) {        
              console.timeLog("request: " + localCounter, "Found user: " + foundJson.tid);
                  
              body = {
                source: "Tlv Conf",
                destination: ["+972546592374"],
                text: `${foundJson.name} שלום, הנה כרטיס הכניסה שלך לכנס אגף המיחשוב 2018:`// ${config.ticketUrl}${foundJson.id}`
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
              })
                .then(resp => {
                  const found = listItems.find(item => {
                    return item.id == foundJson.id;
                  });
                  if (found) {
                    found.sent = true;
                    console.timeLog("request: " + localCounter, "sms sent to: " + foundJson.phoneNumber);
                    console.timeEnd([label])
                  }
                })
                .catch(err => {
                  console.error("request: " + localCounter);
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
    res.status(400).send({
      success: "false",
      message: err.message
    });
  });
});

const PORT = process.env.PORT || config.port;

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});