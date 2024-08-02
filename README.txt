
# AWS Account 
account: 659104334423
pwd: 
 - admin console sign in: https://659104334423.signin.aws.amazon.com/console
 - region: us-east-1

# Github 
- code: https://github.com/uopsdod/aws-serverless-course-airplane
- cdk: https://github.com/uopsdod/aws-serverless-course-airplane-cdk 

# 建立 Github Token 
 - Settings > Developer settings > Personal access tokens > Generate new token > Classic
  - name: "github-token-for-aws-serverless-course-airplane"
  - click 'repo'
  - click 'admin:repo_hook'

# 建立 AWS Secret Key 
- Go to AWS Secrets Manager 
- Secret type: Choose "Other type of secret"
- Key/value pairs: Use "token" as the key and paste your GitHub personal access token as the value.
- Descriptive Secret name: "github-token-for-aws-serverless-course-airplane"

# Install AWS CDK CLI
npm install -g aws-cdk

# Create a New CDK Project
cd {your_cdk_folder/} 
cdk init app --language=typescript

# Install Required CDK Libraries
npm install @aws-cdk/aws-iam @aws-cdk/aws-ec2 @aws-cdk/aws-s3 @aws-cdk/aws-s3-deployment @aws-cdk/aws-lambda @aws-cdk/aws-sns @aws-cdk/aws-events @aws-cdk/aws-events-targets aws-cdk-lib @aws-cdk/core
npm install --save-dev @types/node

# CDK Bootstrap 
aws configure 
cdk bootstrap

# 修改 pipeline.ts 
 - const secretArn = 'YourAwsScretArn';
 - change githubOwner = 'YourGithubOwner';

# Deploy Pipeline Stack  
cdk synth PipelineStack

$SECRET_ARN=XXXXX
$GITHUB_OWNER=XXXXX
cdk deploy PipelineStack --require-approval never\
 -c secretArn=$SECRET_ARN \
 -c githubOwner=$GITHUB_OWNER

# Trigger Pipeline
- this includes building the ssm key for the first time 

# Deploy beta 
npx cdk synth S3StaticWebsiteStack-beta -c stage=beta
npx cdk synth ServiceStack-beta -c stage=beta
npx cdk synth DynamoDBStack-beta -c stage=beta

npx cdk destroy ServiceStack-beta -f
npx cdk destroy S3StaticWebsiteStack-beta -f
npx cdk destroy DynamoDBStack-beta -f

npx cdk deploy DynamoDBStack-beta -c stage=beta --require-approval never
npx cdk deploy S3StaticWebsiteStack-beta -c stage=beta --require-approval never
npx cdk deploy ServiceStack-beta -c stage=beta --require-approval never

# follow deployspec-cdk.yml
 # Delete Depedent Stacks 
 # Deploy Dashboard ServiceStack
 # Deploy Service ServiceStack

# enable eventbridge to collect flight price  

# invoke report API to see the current report 
- example url: https://ay0e083p0m.execute-api.us-east-1.amazonaws.com/prod?date=2024-08-02

# clean up
cdk destroy --all -c stage=beta

# Nexts
 - [DONE] push git commit 
 - [DONE] start to parse your 2 mock sites 
 - [DONE] SNS > Email 
 - [DONE] leverage SSM Key/Value Pair to decouple cdk stacks 
 - next: use dynamodb 
 - next: use API Gateway 

 