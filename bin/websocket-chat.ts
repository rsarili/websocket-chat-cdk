#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WebsocketChatStack } from '../lib/websocket-chat-stack';

const app = new cdk.App();
new WebsocketChatStack(app, 'WebsocketChatStack');
