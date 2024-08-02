import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

interface ServiceStackProps extends cdk.StackProps {
  STAGE: string;
  ARTIFACT_BUCKET_SSM_KEY: string;
  LAYER_ARTIFACT_SSM_KEY: string;  
  PARSER_ARTIFACT_SSM_KEY: string;
  WRAPPER_PARSER_ARTIFACT_SSM_KEY: string;
  SUFFIX_TAG: string;
  SUFFIX_RANDOM: string;
  // APPLE_WEBSITE_URL: string;
  // BANANA_WEBSITE_URL: string;
}



export class ServiceStack extends cdk.Stack {
  public readonly parserLambdaFunction: lambda.Function;
  constructor(scope: Construct, id: string, props: ServiceStackProps) {
    super(scope, id, props);

    const suffix_tag = props.SUFFIX_TAG
    const suffix_random = props.SUFFIX_RANDOM
    const stage = props.STAGE

    // IAM Role for Lambda
    const lambdaRole = new iam.Role(this, `ParserLambdaRole-${suffix_tag}-${stage}`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLambda_FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSNSFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSQSFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
      ],
      roleName: `parser-lambda-role-${suffix_tag}-${stage}`,
    });

    // SNS Topic
    const topic = new sns.Topic(this, `sns-for-best-plane-ticket-${suffix_tag}-${stage}`, {
      topicName: `sns-for-best-plane-ticket-${suffix_tag}-${stage}`,
    });

    // SQS for wrapper and parser 
    // Create the SQS queue
    // const queue = new sqs.Queue(this, `sqs-for-best-plane-ticket-${suffix_tag}-${suffix_random}-${stage}`, {
    //   queueName: `sqs-for-best-plane-ticket-${suffix_tag}-${suffix_random}-${stage}`,
    //   visibilityTimeout: cdk.Duration.minutes(15), // must >= lambda timeout setting
    //   retentionPeriod: cdk.Duration.days(1)
    // });

    // Grant send permission to the role
    // queue.grantSendMessages(lambdaRole);

    // Grant receive and delete permissions to the role
    // queue.grantConsumeMessages(lambdaRole);

    // Read parameters from SSM Parameter Store
    const artifactBucketName = ssm.StringParameter.valueForStringParameter(this, props.ARTIFACT_BUCKET_SSM_KEY);
    const buildLayerOutputS3Location = ssm.StringParameter.valueForStringParameter(this, props.LAYER_ARTIFACT_SSM_KEY);
    const buildParserOutputS3Location = ssm.StringParameter.valueForStringParameter(this, props.PARSER_ARTIFACT_SSM_KEY);
    const buildWrapperParserOutputS3Location = ssm.StringParameter.valueForStringParameter(this, props.WRAPPER_PARSER_ARTIFACT_SSM_KEY);

    // // S3 Bucket (Existing)
    // const artifactBucketName = 'lambdapackagingpipelinestac-artifactbucket7410c9ef-h1kxeqzibjpt';
    const existingBucket = s3.Bucket.fromBucketName(this, 'ExistingBucket', artifactBucketName);

    const appleWebsiteUrl = ssm.StringParameter.valueForStringParameter(this, `/myapp/appleWebsiteUrl`);
    const bananaWebsiteUrl = ssm.StringParameter.valueForStringParameter(this, `/myapp/bananaWebsiteUrl`);    
    const flightPricesTableName = ssm.StringParameter.valueForStringParameter(this, `/myapp/flightPricesTableName`);

    // Lambda Layer
    const layer = new lambda.LayerVersion(this, `ParserDependencyLayer-${suffix_tag}-${suffix_random}-${stage}`, {
      code: lambda.Code.fromBucket(existingBucket, buildLayerOutputS3Location),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: `Parser Dependency Layer ${suffix_tag}`,
    });

    // Lambda Function
    this.parserLambdaFunction = new lambda.Function(this, `parser_${suffix_tag}_${stage}`, {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromBucket(existingBucket, buildParserOutputS3Location),
      handler: 'parser.handler',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      functionName: `parser_${suffix_tag}_${stage}`,
      layers: [layer],
      environment: {
        SNS_TOPIC_ARN: topic.topicArn,
        STAGE: stage,
        // SQS_URL_FOR_BAG_LINK_TO_CHECK: queue.queueUrl,
      }
    });

    // Wrapper Lambda Function
    const wrapperFunction = new lambda.Function(this, `parser_wrapper_${suffix_tag}_${stage}`, {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromBucket(existingBucket, buildWrapperParserOutputS3Location),
      handler: 'parser_wrapper.handler',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(15),
      functionName: `parser_wrapper_${suffix_tag}_${stage}`,
      layers: [layer],
      environment: {
        TARGET_LAMBDA_NAME: this.parserLambdaFunction.functionName,
        S3_BUCKET_NAME_PLAN_BAG_MAPPING: 'plan-bag-mapping-12938u9120837091283',
        S3_FILE_NAME_PLAN_BAG_MAPPING: 'plan-bag-mapping - file.csv',
        SNS_TOPIC_ARN: topic.topicArn,
        APPLE_WEBSITE_URL: appleWebsiteUrl,
        BANANA_WEBSITE_URL: bananaWebsiteUrl,
        DDB_TABLE_NAME: flightPricesTableName,
      }
    });

    // Add SQS queue as an event source to the Lambda function
    // TODO: creat a new lambda function to receive this sqs message 
    // this.parserLambdaFunction.addEventSource(new lambdaEventSources.SqsEventSource(queue, {
    //   batchSize: 1,
    //   enabled: true
    // }));

    // EventBridge Rule
    const rule = new events.Rule(this, `WeekdayScheduler-${suffix_tag}-${suffix_random}-${stage}`, {
      schedule: events.Schedule.cron({ minute: '*/5', hour: '13-18', weekDay: 'MON-FRI' }),
      ruleName: `weekday-scheduler-${suffix_tag}-${suffix_random}-${stage}`,
      description: `weekday-scheduler-${suffix_tag}-${suffix_random}-${stage}`,
      enabled: ((stage == 'beta')?false:true)
    });

    rule.addTarget(new targets.LambdaFunction(wrapperFunction));
  }
}
