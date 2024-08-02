import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';

interface DynamoDBStackProps extends cdk.StackProps {
  SUFFIX_RANDOM: string;
  ARTIFACT_BUCKET_SSM_KEY: string;
//   LAYER_ARTIFACT_SSM_KEY: string;  
  REPORT_ARTIFACT_SSM_KEY: string;
}

export class DynamoDBStack extends Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDBStackProps) {
    super(scope, id, props);

    // Define the DynamoDB table
    this.table = new dynamodb.Table(this, 'FlightPricesTable', {
        tableName: `FlightPricesReportTable-${props.SUFFIX_RANDOM}`,
        partitionKey: { name: 'date', type: dynamodb.AttributeType.STRING }, // Partition Key
        sortKey: { name: 'time', type: dynamodb.AttributeType.STRING }, // Sort Key
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Use on-demand billing mode
        removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production, for development only
    });

    // Create SSM parameters
    new ssm.StringParameter(this, `FlightPricesTableParameter`, {
        parameterName: `/myapp/flightPricesTableName`,
        stringValue: this.table.tableName,
    });

    // Add attributes as defined (note: DynamoDB is schema-less, you don't need to define attributes explicitly)
    // You can add these attributes while putting an item 

    // IAM Role for Lambda
    const lambdaRole = new iam.Role(this, 'QueryLambdaRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));
    this.table.grantReadData(lambdaRole);

    // Read parameters from SSM Parameter Store
    const artifactBucketName = ssm.StringParameter.valueForStringParameter(this, props.ARTIFACT_BUCKET_SSM_KEY);
    // const buildLayerOutputS3Location = ssm.StringParameter.valueForStringParameter(this, props.LAYER_ARTIFACT_SSM_KEY);
    const buildReportOutputS3Location = ssm.StringParameter.valueForStringParameter(this, props.REPORT_ARTIFACT_SSM_KEY);
    const existingBucket = s3.Bucket.fromBucketName(this, 'ExistingBucket', artifactBucketName);

    // Lambda Function
    const queryLambda = new lambda.Function(this, 'QueryDynamoDBLambda', {
        runtime: lambda.Runtime.PYTHON_3_12,
        code: lambda.Code.fromBucket(existingBucket, buildReportOutputS3Location),
        handler: 'report.handler',
        role: lambdaRole,
        timeout: cdk.Duration.minutes(15),
        functionName: `report_lambda`,
        environment: {
            DDB_TABLE_NAME: this.table.tableName,
        },
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'QueryDynamoDBApi', {
        restApiName: 'QueryDynamoDBService',
        description: 'This service queries DynamoDB based on date.',
    });

    const getDateIntegration = new apigateway.LambdaIntegration(queryLambda);

    // sample api: https://ay0e083p0m.execute-api.us-east-1.amazonaws.com/prod?date=2024-08-02
    api.root.addMethod('GET', getDateIntegration, {
        requestParameters: {
            'method.request.querystring.date': true,
        },
        requestValidatorOptions: {
            requestValidatorName: 'QueryStringValidator',
            validateRequestParameters: true,
        },
    });

  }
}
