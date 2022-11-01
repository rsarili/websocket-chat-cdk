import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import {Aws} from 'aws-cdk-lib'
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from 'constructs';
import { WebsocketApi } from './websocket-api';

export interface WebsocketchatStackProps extends StackProps{
  stageName:string
}

export class WebsocketChatStack extends Stack {
  constructor(scope: Construct, id: string, props: WebsocketchatStackProps) {
    super(scope, id, props);

    const connectionTable = new dynamodb.Table(this, 'WsConnections', {
      partitionKey: {name:'connectionId', type: dynamodb.AttributeType.STRING},
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    })
    connectionTable.addGlobalSecondaryIndex({
      indexName: 'UsernameIndex',
      partitionKey: { name:'username', type: dynamodb.AttributeType.STRING},
      projectionType: dynamodb.ProjectionType.ALL
    })

    const websocketApi = new WebsocketApi(this, id, {
      apiName: 'WebsocketChat',
      apiDescription: 'chat through websocket',
      connectionsTbl: connectionTable
    })
    const connectionUrl =  `https://${websocketApi.api.ref}.execute-api.${Aws.REGION}.amazonaws.com/dev`


    const userTable = new dynamodb.Table(this, 'UserTable', {
      partitionKey: {name:'username', type: dynamodb.AttributeType.STRING},
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    })

    const wsHandler = new lambda.Function(this, 'WsHandler', {
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: 'handler.connectionHandler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        CONNECTION_TABLE: connectionTable.tableName,
        USER_TABLE: userTable.tableName,
        APIG_ENDPOINT: connectionUrl
      }
    })
    wsHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [ "execute-api:ManageConnections" ],
      resources: [ `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${websocketApi.api.ref}/*` ]
    }));

    connectionTable.grantReadWriteData(wsHandler)
    userTable.grantReadWriteData(wsHandler)
    websocketApi.addRoute(wsHandler, '$connect', 'ConnectRoute')
    websocketApi.addRoute(wsHandler, '$disconnect', 'DisconnectRoute')
    websocketApi.addRoute(wsHandler, 'broadcast', 'BroadcastRoute')
    websocketApi.addRoute(wsHandler, 'getUsers', 'GetUsersRoute')

    new CfnOutput(this, 'WebsocketConnectionUrl', { value: connectionUrl });

    new CfnOutput(this, "websocketUrl", {
      value: `${websocketApi.api.attrApiEndpoint}/${props.stageName}`
    });
  }
}
