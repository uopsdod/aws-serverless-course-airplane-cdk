
# AWS Account now 
account: XXXXX
pwd: 
 - admin console sign in: XXXXX
 - region: us-east-1

# Github repo: XXXXX 

# 建立 Github Token 
 - Settings > Developer settings > Personal access tokens > Generate new token > Classic
  - click 'repo'
  - click 'admin:repo_hook'

# 建立 AWS Secret Key 
- Secret type: Choose "Other type of secret"
- Key/value pairs: Use token as the key and paste your GitHub personal access token as the value.
- Secret name: "github-token-for-aws-serverless-001" 

# 修改 pipeline.ts 
const secretArn = 'XXXXX';

# 修改 api key !

# Install AWS CDK CLI
npm install -g aws-cdk

# Create a New CDK Project
cdk init app --language=typescript

# Install Required CDK Libraries
npm install @aws-cdk/aws-iam @aws-cdk/aws-ec2 @aws-cdk/aws-s3 @aws-cdk/aws-lambda @aws-cdk/aws-sns @aws-cdk/aws-events @aws-cdk/aws-events-targets

# CDK Bootstrap 
aws configure 
cdk bootstrap

# Deploy Pipeline Stack  
cd XXXXX 
cdk synth PipelineStack
cdk deploy PipelineStack --require-approval never

# Trigger Pipeline

# Deploy beta 
npx cdk synth ServiceStack-beta -c stage=beta
npx cdk synth DashboardStack-beta -c stage=beta
npx cdk destroy DashboardStack-beta -c stage=beta --force
npx cdk deploy ServiceStack-beta -c stage=beta --require-approval never
npx cdk deploy DashboardStack-beta -c stage=beta --require-approval never

# follow XXXXX/deployspec-cdk.yml
 # Delete Depedent Stacks 
 # Deploy Dashboard ServiceStack
 # Deploy Service ServiceStack
