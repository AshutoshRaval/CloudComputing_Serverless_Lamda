# Serverless Lamda

The Repository has the Code for the server less lamda funtion which is triggered when an SNS mesaage is publised.

**Higlight of the Repository**
- The lamda code is uploaded to the AWS Lamda using the pulumi.
- The Environment variables are passed through the environment parameter in the lamda function declartion in the pulumi.
- The code triggers on the SNS message published.

**Flow of the lamda Code**
- The SNS message is pasrsed.
- A release is downloaded from the url provided during the submisson in the web application.
- The downloaded relase is then uploaded the GCP
- Sending an email about the relase download status to the user who submited request
- Maintaing the record in the dynamoDB

Common issue encountered
- Install the dependency using the 'npm i' command
- Create a new folder 'nodejs' and then move the node module folder into it, reason for the this the additional node module layer
- Check for the environment variables and its values passed through the pulumi code wile lamda creation

Note : Use Visual studio code extension to upload the lamda code. It simplifes the upload and debugging steps for lamda.
