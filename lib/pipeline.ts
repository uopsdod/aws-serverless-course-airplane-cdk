import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
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
  public readonly REPORT_ARTIFACT_SSM_KEY: string;
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
    const secretArn = this.node.tryGetContext('secretArn');
    const githubOwner = this.node.tryGetContext('githubOwner');
    const githubRepo = 'aws-serverless-course-airplane'
    const githubRepoCdk = 'aws-serverless-course-airplane-cdk'

    // Source Stage - Service package
    const sourceServiceOutput = new codepipeline.Artifact();
    const sourceServiceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source_Service',
      owner: githubOwner,
      repo: githubRepo,
      oauthToken: cdk.SecretValue.secretsManager(secretArn, { jsonField: 'token' }),
      output: sourceServiceOutput,
      branch: 'main',
    });

    // Source Stage - CDK package
    const sourceCDKOutput = new codepipeline.Artifact();
    const sourceCDKAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source_CDK',
      owner: githubOwner,
      repo: githubRepoCdk,
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

    const buildLayerOutput = new codepipeline.Artifact();
    const buildLayerAction = this.createBuildAction('BuildLayerProject', 'buildspec-layer.yml', buildLayerOutput, sourceCDKOutput, codeBuildRole, {
      ARTIFACT_BUCKET: artifactBucket.bucketName,
      ARTIFACT_BUCKET_SSM_KEY: this.ARTIFACT_BUCKET_SSM_KEY,
      ARTIFACT_BUCKET_SSM_VALUE: artifactBucket.bucketName,
      LAYER_ARTIFACT_SSM_KEY: this.LAYER_ARTIFACT_SSM_KEY,
      LAYER_ARTIFACT_SSM_VALUE: 'parser_layer.zip',
    });

    // create Lambda Parser 
    this.PARSER_ARTIFACT_SSM_KEY = '/lambda/packaging/buildParserOutputS3Location';

    const buildParserOutput = new codepipeline.Artifact();
    const buildParserAction = this.createBuildAction('BuildParserProject', 'buildspec-parser.yml', buildParserOutput, sourceCDKOutput, codeBuildRole, {
      ARTIFACT_BUCKET: artifactBucket.bucketName,
      ARTIFACT_BUCKET_SSM_KEY: this.ARTIFACT_BUCKET_SSM_KEY,
      ARTIFACT_BUCKET_SSM_VALUE: artifactBucket.bucketName,
      PARSER_ARTIFACT_SSM_KEY: this.PARSER_ARTIFACT_SSM_KEY,
    }, [sourceServiceOutput]);

    // create Wrapper Lambda Parser 
    this.WRAPPER_PARSER_ARTIFACT_SSM_KEY = '/lambda/packaging/buildWraperParserOutputS3Location';

    const buildWrapperParserOutput = new codepipeline.Artifact();
    const buildWrapperParserAction = this.createBuildAction('BuildWrapperParserProject', 'buildspec-parser-wrapper.yml', buildWrapperParserOutput, sourceCDKOutput, codeBuildRole, {
      ARTIFACT_BUCKET: artifactBucket.bucketName,
      ARTIFACT_BUCKET_SSM_KEY: this.ARTIFACT_BUCKET_SSM_KEY,
      ARTIFACT_BUCKET_SSM_VALUE: artifactBucket.bucketName,
      WRAPPER_PARSER_ARTIFACT_SSM_KEY: this.WRAPPER_PARSER_ARTIFACT_SSM_KEY,
    }, [sourceServiceOutput]);

    // create Report Lambda  
    this.REPORT_ARTIFACT_SSM_KEY = '/lambda/packaging/buildReportOutputS3Location';

    const buildReportOutput = new codepipeline.Artifact();
    const buildReportAction = this.createBuildAction('BuildReportProject', 'buildspec-report.yml', buildReportOutput, sourceCDKOutput, codeBuildRole, {
      ARTIFACT_BUCKET: artifactBucket.bucketName,
      ARTIFACT_BUCKET_SSM_KEY: this.ARTIFACT_BUCKET_SSM_KEY,
      ARTIFACT_BUCKET_SSM_VALUE: artifactBucket.bucketName,
      REPORT_ARTIFACT_SSM_KEY: this.REPORT_ARTIFACT_SSM_KEY,
    }, [sourceServiceOutput]);

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
            buildLayerAction,
            buildParserAction,
            buildWrapperParserAction,
            buildReportAction,
          ],
        },
        {
          stageName: 'Deploy-Beta',
          actions: [
            deployCDKActionBeta,
          ],
        },
      ],
    });
  }

  private createBuildAction(
    projectName: string,
    buildSpecFilename: string,
    outputArtifact: codepipeline.Artifact,
    inputArtifact: codepipeline.Artifact,
    role: iam.Role,
    environmentVariables: { [key: string]: string },
    extraInputs: codepipeline.Artifact[] = []
  ): codepipeline_actions.CodeBuildAction {
    const project = new codebuild.PipelineProject(this, projectName, {
      buildSpec: codebuild.BuildSpec.fromSourceFilename(buildSpecFilename),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      role,
      environmentVariables: Object.entries(environmentVariables).reduce((acc, [key, value]) => {
        acc[key] = { value };
        return acc;
      }, {} as { [key: string]: codebuild.BuildEnvironmentVariable }),
    });

    return new codepipeline_actions.CodeBuildAction({
      actionName: projectName,
      project,
      input: inputArtifact,
      extraInputs,
      outputs: [outputArtifact],
    });
  }
}
