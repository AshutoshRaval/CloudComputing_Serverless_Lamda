const AWS = require('aws-sdk');
const https = require('https');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');
const uuidv4 = require('uuid').v4;
const axios = require('axios');
const { createGzip } = require('zlib');
const { pipeline } = require('stream');
const { promisify } = require('util');
const unzipper  = require('unzipper');
const pipe = promisify(pipeline);
let submissionUrl = ''
let userEmail =''

const ses = new AWS.SES();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const decodedPrivateKey = Buffer.from(process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY, 'base64').toString('utf-8');
const parsedObject  = JSON.parse(decodedPrivateKey)

const storage = new Storage({
  projectId: process.env.GCP_PROJECT,
  credentials: {
      client_email: parsedObject.client_email,
      private_key: parsedObject.private_key,
      // ...other necessary fields from the service account JSON
  },
});
const bucketName = process.env.GCP_BUCKET_NAME;

// Send email notification
const sendEmail  = async (recipientEmail, subject, body) => {
  console.log('in send email file')
  console.log(process.env.MAILGUN_DOMAIN)
  console.log(process.env.MAILGUN_API_KEY)
  const mailgunApiKey = process.env.MAILGUN_API_KEY;
   const domain = process.env.MAILGUN_DOMAIN;
  //const domain = 'demo.ashutoshraval.com';
  const mailgunUrl = `https://api.mailgun.net/v3/${domain}/messages`;

  const auth = 'Basic ' + Buffer.from(`api:${mailgunApiKey}`).toString('base64');

  const response = await axios.post(
    mailgunUrl,
    new URLSearchParams({
      from: `Your Service <mailgun@${domain}>`,
      to: recipientEmail,
      subject: subject,
      text: body,
    }),
    {
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  console.log('email sent')
  return response.data;
};
// Record email event in DynamoDB
const recordEmailEvent = async (email, subject) => {
  console.log('in record email file')
  const params = {
    TableName: 'EmailRecords',
    Item: {
      id: uuidv4(),
      email: email,
      subject: subject,
      timestamp: Date.now(),
    },
  };
  return dynamoDB.put(params).promise();
};

const checkReleaseExists = async (releaseUrl) => {
  console.log('checking relase Exist or not')
  console.log(releaseUrl)
  try {
    const response = await axios.head(releaseUrl);
    return response.status === 200;
  } catch (error) {
    return false;
  }
};


const isValidURL = (url) => {
  console.log('checking Valid URL')
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

const checkReleaseContents = async (tempFilePath) => {
  console.log('Checking Release Contents')
  try {
    //const fileContents = await fs.readFile(tempFilePath);
    const fileContents = await fs.promises.readFile(tempFilePath, 'utf-8');
    //console.log(fileContents)
    const files = await unzipper.Open.buffer(fileContents);
    console.log(files.entries.length)
    return files.entries.length > 0;
  } catch (error) {
    console.log(error);
    return false;
  }
};

exports.handler = async (event) => {

let parsedMessage;
try {
  
  console.log("Raw event:", event);
  console.log("Received event:", JSON.stringify(event, null, 2));
  console.log('Looging service account')
  console.log(process.env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY) 
  console.log('decoded service account')
  console.log(decodedPrivateKey) 
  console.log(parsedObject.private_key) 
  console.log(parsedObject.client_email)
  //const message  = event.Records[0].Sns.Message;
  const snsEvent = JSON.parse(event.Records[0].Sns.Message);
  submissionUrl = snsEvent.submission_url;
  userEmail = snsEvent.user_email;
  console.log(submissionUrl)
  console.log(userEmail)
  // userEmail
  const isURLValid = isValidURL(submissionUrl);
if (!isURLValid) {
  // Handle invalid URL
  throw new Error('Invalid URL provided');
  //return { statusCode: 400, body: 'Invalid URL provided' };
}

const doesReleaseExist = await checkReleaseExists(submissionUrl);
  if (!doesReleaseExist) {
    // Handle release not existing
    throw new Error('Release does not exist');
    //return { statusCode: 404, body: 'Release does not exist' };
  }

} catch (e) {
  console.error("Error parsing SNS message:", e);
  // Handle the error appropriately
}


  
  // const fileUrl = "https://github.com/tparikh/myrepo/archive/refs/tags/v1.0.0.zip";
  const fileUrl = submissionUrl
//   const recipientEmail = message.recipientEmail; // Recipient's email address
  const recipientEmail = 'raval.as@northeastern.edu'; 
  //const recipientEmail = userEmail

  try {
    
    //const releaseUrl = 'https://github.com/tparikh/myrepo/archive/refs/tags/v1.0.0.zip';
    const releaseUrl = submissionUrl;
    const tempFilePath = '/tmp/release.zip';
    const isValid = isValidURL(submissionUrl);

    const writer = fs.createWriteStream(tempFilePath);
    const response = await axios.get(releaseUrl, { responseType: 'stream' });

    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log('Release downloaded successfully.');
    console.log(tempFilePath)
    // const hasContents = await checkReleaseContents(tempFilePath);
    // if (!hasContents) {
    //   // Handle empty release
    //   return { statusCode: 400, body: 'Release is empty' };
    // }

    const fileName = 'Test.zip'; // Destination file name in GCS
     // Sanitize the user email to be used in the file path
    const userEmailSanitized = userEmail.replace(/[^a-zA-Z0-9]/g, "_");
    // Construct the unique file path for this submission
    const gcsFileName = `${userEmailSanitized}/submissions/${fileName}`;

    // console.log(userEmailSanitized)
    // console.log(gcsFileName)
    // console.log(tempFilePath)
    // console.log(bucketName)

    try{
    await storage.bucket(bucketName).upload(tempFilePath, {
      destination: gcsFileName,
    });
     }
     catch(error){
      console.error(error);
     }
    const gcsFilePath = `gs//${bucketName}/${fileName}`;
    console.log(gcsFilePath)
    console.log('Release uploaded to Google Cloud Storage.');

    // Send email notification
    const emailSubject = 'Download Complete';
    const emailBody = `Your file has been downloaded and uploaded to: ${gcsFilePath}`;
    await sendEmail(recipientEmail, emailSubject, emailBody);
    console.log('Sending email Done')

    // Record the email event in DynamoDB
    const emailData = {
      Id: uuidv4(),
      email: recipientEmail,
      status: 'Sent',
      GCP_Link: gcsFilePath,
      timestamp: new Date().toISOString(),
    };

    const params = {
      TableName: process.env.DYNAMO_DB,
      Item: emailData,
    };
    console.log('Updating DynamoDB')
    await dynamoDB.put(params).promise();
    console.log('Updated DynamoDB')

    return { statusCode: 200, body: 'Success' };
  } catch (error) {
    console.error(error);

    // Send email notification about the failure
    console.log(error.message)
    await sendEmail(recipientEmail, 'Download Failed', `An error occurred while processing your file. ${error.message}`);

    const emailData = {
      Id: uuidv4(),
      email: recipientEmail,
      status: error.message,
      GCP_Link: 'No Upload',
      timestamp: new Date().toISOString(),
    };

    const params = {
      TableName: process.env.DYNAMO_DB,
      Item: emailData,
    };
    console.log('Updating DynamoDB for error')
    await dynamoDB.put(params).promise();
    console.log('Updated DynamoDB for error')

    // Record the failed email event in DynamoDB
    //await recordEmailEvent(recipientEmail, 'Download Failed');

    return { statusCode: 500, body: 'Error' };
  }
};
