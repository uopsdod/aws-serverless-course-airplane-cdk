import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { ServiceStack } from './service';
import * as lambda from 'aws-cdk-lib/aws-lambda';

interface DashboardStackProps extends cdk.StackProps {
  STAGE: string;
    serviceStack: ServiceStack;
}

export class DashboardStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DashboardStackProps) {
    super(scope, id, props);

    const stage = props.STAGE;

    // Define the CloudWatch metrics for each status code
    const statusCodes = ['403', '404', '200', '429', '422', '504', '304'];
    const metrics = statusCodes.map(statusCode => new cloudwatch.Metric({
      namespace: `WebScraper-${stage}`,
      metricName: 'ResponseStatusCode',
      dimensionsMap: {
        'Service': 'BagAvailabilityChecker',
        'StatusCode': statusCode,
      },
      statistic: 'Sum',
      unit: cloudwatch.Unit.COUNT,
      label: `StatusCode ${statusCode}`,
    }));

    // Create a CloudWatch dashboard
    const dashboard = new cloudwatch.Dashboard(this, `WebScraperDashboard-${stage}`, {
      dashboardName: `WebScraperDashboard-${stage}`,
    });

    // Add a graph widget to the dashboard that includes all status codes
    const graphWidget = new cloudwatch.GraphWidget({
      title: 'Response Status Codes (Last 7 days)',
      left: metrics,
      width: 24, // Full width of the dashboard
      height: 6,
      period: cdk.Duration.minutes(5), // Data granularity
      setPeriodToTimeRange: true,
      start: '-P7D', // Start time: 7 days ago
      end: 'P0D' // End time: now
    });


    // Add a Log Insights widget to the dashboard
    const logInsightsWidget = new cloudwatch.LogQueryWidget({
      title: 'Lambda [ERROR] Logs',
      logGroupNames: [props.serviceStack.parserLambdaFunction.logGroup.logGroupName],
      view: cloudwatch.LogQueryVisualizationType.TABLE,
      queryLines: [
        'fields @timestamp, @message, @logStream, @log',
        'filter @message like "[ERROR]"',
        'sort @timestamp desc',
        'limit 10000'
      ],
      width: 24, // Full width of the dashboard
      height: 6,
    });

    // Add widgets to the dashboard
    dashboard.addWidgets(graphWidget, logInsightsWidget);  
  }
}
