import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as fs from 'fs';
import * as path from 'path';

interface S3StaticWebsiteProps extends cdk.StackProps {
  SUFFIX_RANDOM: string;
  STAGE: string;
}

export class S3StaticWebsiteStack extends Stack {
  constructor(scope: Construct, id: string, props: S3StaticWebsiteProps) {
    super(scope, id, props);

    // Use the SUFFIX_RANDOM in resource names
    const suffix = props.SUFFIX_RANDOM;

    // Create the first S3 bucket for the 3-row website
    const bucket3Rows = new s3.Bucket(this, `FlightPrices3Rows-${suffix}`, {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS, // Adjust the block public access configuration
    });

    // Create the second S3 bucket for the 5-row website
    const bucket5Rows = new s3.Bucket(this, `FlightPrices5Rows-${suffix}`, {
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS, // Adjust the block public access configuration
    });

    // Read HTML content from files
    const htmlContent3Rows = fs.readFileSync(path.join(__dirname, '../html/3-rows.html'), 'utf8');
    const htmlContent5Rows = fs.readFileSync(path.join(__dirname, '../html/5-rows.html'), 'utf8');

    // Deploy the HTML content to the 3-row website bucket
    new s3deploy.BucketDeployment(this, `DeployWebsite3Rows-${suffix}`, {
      sources: [s3deploy.Source.data('index.html', htmlContent3Rows)],
      destinationBucket: bucket3Rows,
    });

    // Deploy the HTML content to the 5-row website bucket
    new s3deploy.BucketDeployment(this, `DeployWebsite5Rows-${suffix}`, {
      sources: [s3deploy.Source.data('index.html', htmlContent5Rows)],
      destinationBucket: bucket5Rows,
    });

    new cdk.CfnOutput(this, `WebsiteURL3Rows-${suffix}`, {
      value: bucket3Rows.bucketWebsiteUrl,
      description: `URL for the 3-row flight prices website - ${suffix}`,
    });

    new cdk.CfnOutput(this, `WebsiteURL5Rows-${suffix}`, {
      value: bucket5Rows.bucketWebsiteUrl,
      description: `URL for the 5-row flight prices website - ${suffix}`,
    });
  }
}
