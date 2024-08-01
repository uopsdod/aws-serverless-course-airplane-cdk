#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ServiceStack } from '../lib/service';
import { PipelineStack } from '../lib/pipeline';
import { DashboardStack } from '../lib/dashboard';

const accountId = '659104334423';
const region = 'us-east-1';

const app = new cdk.App();
const pipelineStack = new PipelineStack(app, 'PipelineStack', {
  env: {
    account: accountId,
    region: region
  }
});

// Retrieve the stage context variable, with a default value of 'dev'
const stage = app.node.tryGetContext('stage') || 'dev';
const suffix_random = generateRandomSuffix()
const serviceStack = new ServiceStack(app, `ServiceStack-${stage}`, {
  STAGE: stage,
  SUFFIX_TAG: "scrapefly",
  SUFFIX_RANDOM: suffix_random,
  ARTIFACT_BUCKET_SSM_KEY: pipelineStack.ARTIFACT_BUCKET_SSM_KEY,
  LAYER_ARTIFACT_SSM_KEY: pipelineStack.LAYER_ARTIFACT_SSM_KEY,  
  PARSER_ARTIFACT_SSM_KEY: pipelineStack.PARSER_ARTIFACT_SSM_KEY,
  WRAPPER_PARSER_ARTIFACT_SSM_KEY: pipelineStack.WRAPPER_PARSER_ARTIFACT_SSM_KEY,
  env: {
    account: accountId,
    region: region
  }
});

const dashboardStack = new DashboardStack(app, `DashboardStack-${stage}`, {
  STAGE: stage,
  serviceStack: serviceStack,
  env: {
    account: accountId,
    region: region
  }
});

function generateRandomSuffix() {
  return Math.random().toString(36).substring(2, 8);
}