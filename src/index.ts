#!/usr/bin/env node

import Client from './Client';

const client = new Client(57600, true);

client.init();
