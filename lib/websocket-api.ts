import { Construct } from 'constructs';
import { Aws, CfnOutput, Stack } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { IFunction } from 'aws-cdk-lib/aws-lambda';
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';

export interface WebsocketApiProps {
    readonly apiName: string
    readonly apiDescription: string
    readonly routes?: Route[]
    readonly connectionsTbl: ITable;
}

export interface Route {
    readonly routeKey: string
    readonly operationName: string
    readonly fn: IFunction
}

export class WebsocketApi extends Construct {
    readonly props: WebsocketApiProps
    readonly api: apigwv2.CfnApi;
    readonly deployment: apigwv2.CfnDeployment

    constructor(parent: Stack, id: string, props: WebsocketApiProps) {
        super(parent, id)
        this.props = props

        this.api = new apigwv2.CfnApi(this, 'WebSocketApi', {
            name: props.apiName,
            description: props.apiDescription,
            protocolType: "WEBSOCKET",
            routeSelectionExpression: "$request.body.action"
        });

        this.deployment = new apigwv2.CfnDeployment(this, "WebsocketDeployment", {
            apiId: this.api.ref
        });

        const stage = new apigwv2.CfnStage(this, "WebsocketStage", {
            stageName: 'dev',
            apiId: this.api.ref,
            deploymentId: this.deployment.ref
        });

        props.routes?.forEach(route=> {
            this.addRoute(route.fn, route.routeKey, route.operationName)
        })
    }

    addRoute(fn: IFunction, routeKey: string, operationName: string) {
        const integration = new apigwv2.CfnIntegration(this, `${routeKey}Integration`, {
            apiId: this.api.ref,
            integrationType: "AWS_PROXY",
            integrationUri: `arn:aws:apigateway:${Aws.REGION}:lambda:path/2015-03-31/functions/${fn.functionArn}/invocations`
        });

        fn.grantInvoke(new ServicePrincipal('apigateway.amazonaws.com', {
            conditions: {
                "ArnLike": {
                    "aws:SourceArn": `arn:aws:execute-api:${Aws.REGION}:${Aws.ACCOUNT_ID}:${this.api.ref}/*`
                }
            }
        }));

        this.deployment.addDependsOn(new apigwv2.CfnRoute(this, `${operationName}Route`, {
            apiId: this.api.ref,
            routeKey: routeKey,
            authorizationType: "NONE",
            target: `integrations/${integration.ref}`
        }));

    }

}