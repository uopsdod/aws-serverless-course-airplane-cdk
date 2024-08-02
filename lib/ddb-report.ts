import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';

interface DynamoDBStackProps extends cdk.StackProps {
  SUFFIX_RANDOM: string;
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
  }
}
