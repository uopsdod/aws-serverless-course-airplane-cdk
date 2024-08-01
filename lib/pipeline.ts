import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

interface PipelineStackProps extends cdk.StackProps {
}

export class PipelineStack extends cdk.Stack {
  public readonly ARTIFACT_BUCKET_SSM_KEY: string;
  public readonly LAYER_ARTIFACT_SSM_KEY: string;
  public readonly PARSER_ARTIFACT_SSM_KEY: string;
  public readonly WRAPPER_PARSER_ARTIFACT_SSM_KEY: string;
  public readonly INTEGTEST_ARTIFACT_SSM_KEY: string;  
  public readonly INTEGTEST_LAMBDA_FUNCTION_NAME_SSM_KEY: string;  
  
  
  constructor(scope: Construct, id: string, props?: PipelineStackProps) {
    super(scope, id, props);
    // Create a new secret in Secrets Manager
    // Manually Adding the GitHub Token
    // After deploying the stack, you will need to manually add your GitHub token to the created secret in AWS Secrets Manager.

    // Go to the AWS Secrets Manager Console.
    // Find the github-token Secret: Open the secret and click on "Retrieve secret value".
    // Edit the Secret: Click "Edit" and add the GitHub token in the JSON structure, e.g., {"token": "YOUR_GITHUB_PERSONAL_ACCESS_TOKEN"}.
    // Reference the existing secret from AWS Secrets Manager
    const secretArn = 'XXXXX';

    // Source Stage - Service package
    const sourceServiceOutput = new codepipeline.Artifact();
    const sourceServiceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source_Service',
      owner: 'XXXXX', // ex. uopsdod - is this needed?
      repo: 'XXXXX', 
      oauthToken: cdk.SecretValue.secretsManager(secretArn, { jsonField: 'token' }),
      output: sourceServiceOutput,
      branch: 'main',
    });

    // Source Stage - CDK package
    const sourceCDKOutput = new codepipeline.Artifact();
    const sourceCDKAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source_CDK',
      owner: 'XXXXX',
      repo: 'XXXXX',
      oauthToken: cdk.SecretValue.secretsManager(secretArn, { jsonField: 'token' }),
      output: sourceCDKOutput,
      branch: 'main',
    });

    // Build Stage for Lambda Layer
    // Create an IAM role for CodeBuild with S3 permissions
    const codeBuildRole = new iam.Role(this, 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'),
      ],
    });

    // Add an inline policy for iam:PassRole
    codeBuildRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: ['*'],
    }));

    codeBuildRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: ['*'],
    }));

    // Add SSH permissions
    codeBuildRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ssm:StartSession',
        'ssm:SendCommand',
        'ssm:DescribeInstanceInformation',
        'ssm:DescribeSessions',
        'ssm:GetConnectionStatus',
        'ssm:TerminateSession',
      ],
      resources: ['*'],
    }));

    const artifactBucket = new s3.Bucket(this, 'MyArtifactBucket');

    // create lambda layer 
    this.ARTIFACT_BUCKET_SSM_KEY = '/lambda/packaging/artifactBucketName';
    this.LAYER_ARTIFACT_SSM_KEY = '/lambda/packaging/buildLayerOutputS3Location';

    const buildLayerProject = new codebuild.PipelineProject(this, 'BuildLayerProject', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec-layer.yml'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      role: codeBuildRole,
      environmentVariables: {
        ARTIFACT_BUCKET: { value: artifactBucket.bucketName },
        ARTIFACT_BUCKET_SSM_KEY: { value: this.ARTIFACT_BUCKET_SSM_KEY},
        ARTIFACT_BUCKET_SSM_VALUE: { value: artifactBucket.bucketName},
        LAYER_ARTIFACT_SSM_KEY: { value: this.LAYER_ARTIFACT_SSM_KEY},
        LAYER_ARTIFACT_SSM_VALUE: { value: 'parser_layer.zip'},
      },
    });

    const buildLayerOutput = new codepipeline.Artifact();
    const buildLayerAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Build_Layer',
      project: buildLayerProject,
      input: sourceCDKOutput,
      outputs: [buildLayerOutput],
    });

    // create Scrapefly Lambda Parser 
    this.PARSER_ARTIFACT_SSM_KEY = '/lambda/packaging/buildParserOutputS3Location';

    const buildParserProject = new codebuild.PipelineProject(this, 'BuildParserProject', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec-parser.yml'), 
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      role: codeBuildRole,
      environmentVariables: {
        ARTIFACT_BUCKET: { value: artifactBucket.bucketName },
        ARTIFACT_BUCKET_SSM_KEY: { value: this.ARTIFACT_BUCKET_SSM_KEY},
        ARTIFACT_BUCKET_SSM_VALUE: { value: artifactBucket.bucketName},
        PARSER_ARTIFACT_SSM_KEY: { value: this.PARSER_ARTIFACT_SSM_KEY},
      },
    });

    const buildParserOutput = new codepipeline.Artifact();
    const buildParserAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Build_Parser',
      project: buildParserProject,
      input: sourceCDKOutput,
      extraInputs: [sourceServiceOutput],
      outputs: [buildParserOutput],
    });

    // create Scrapefly Wrapper Lambda Parser 
    this.WRAPPER_PARSER_ARTIFACT_SSM_KEY = '/lambda/packaging/buildWraperParserOutputS3Location';

    const buildWrapperParserProject = new codebuild.PipelineProject(this, 'BuildWrapperParserProject', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec-parser-wrapper.yml'),  
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      role: codeBuildRole,
      environmentVariables: {
        ARTIFACT_BUCKET: { value: artifactBucket.bucketName },
        ARTIFACT_BUCKET_SSM_KEY: { value: this.ARTIFACT_BUCKET_SSM_KEY},
        ARTIFACT_BUCKET_SSM_VALUE: { value: artifactBucket.bucketName},
        WRAPPER_PARSER_ARTIFACT_SSM_KEY: { value: this.WRAPPER_PARSER_ARTIFACT_SSM_KEY},
      },
    });

    const buildWrapperParserOutput = new codepipeline.Artifact();
    const buildWrapperParserAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'Build_Wrapper_Parser',
      project: buildWrapperParserProject,
      input: sourceCDKOutput,
      extraInputs: [sourceServiceOutput],
      outputs: [buildWrapperParserOutput],
    });

    // deploy - beta
    const deployProjectBeta = new codebuild.PipelineProject(this, 'deployProjectBeta', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('deployspec-cdk.yml'),  
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      role: codeBuildRole,
      environmentVariables: {
        STAGE: { value: 'beta' }
      },
    });

    const deployCDKOutputBeta = new codepipeline.Artifact();
    const deployCDKActionBeta = new codepipeline_actions.CodeBuildAction({
      actionName: 'DeployViaCDK',
      project: deployProjectBeta,
      input: sourceCDKOutput,
      extraInputs: [sourceServiceOutput],
      outputs: [deployCDKOutputBeta],
    });

    // Define Pipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      stages: [
        {
          stageName: 'Source',
          actions: [sourceCDKAction, sourceServiceAction],
        },
        {
          stageName: 'Build',
          actions: [
            buildLayerAction
            , buildParserAction
            , buildWrapperParserAction
          ],
        },{
          stageName: 'Deploy-Beta',
          actions: [
            deployCDKActionBeta
          ],
        }
      ],
    });

  }
}
