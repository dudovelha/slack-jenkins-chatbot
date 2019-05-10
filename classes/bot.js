const token = require('../config.json').jenkinsToken;
const JenkinsStatusClass = require('./jenkinsStatus');
const { RTMClient } = require('@slack/rtm-api');
const { WebClient } = require('@slack/web-api');
const rtm = new RTMClient(token);
const slackBot = new WebClient(token);
const jenkinsStatus = new JenkinsStatusClass();

const OK = ':heavy_check_mark:';
const NOT_OK = ':x:';

class Bot {

    constructor() {
        this.conversations = {};
        this.users = {};
    }

    async start() {
        this.conversations = await this.getConversationList();
        this.users = await this.getUserList();
        this.jenkinsStatus = jenkinsStatus;

        if (this.conversations) {
            console.log('Successfully got the conversations list');
        }
        if (this.users) {
            console.log('Successfully got the user list');
        }

        rtm.start()
            .catch(console.error);

        rtm.on('ready', () => console.log('RTM Ready!'));

        rtm.on('message', this.receiveMessage.bind(this));
    }

    receiveMessage(event) {
        let message = event.text,
            user = this.users[event.user],
            conversationId = event.channel;

        if (message) {
            console.log(`Received: ${message}\nFrom user: ${user}\nIn conversation: ${this.conversations[conversationId]}\n-------------`);
            if (this.isGmMessage(message)) {
                this.sendGmMessage(user, conversationId);
            } else if (this.isJenkinsStatusMessage(message)) {
                this.sendJenkinsStatusMessage(user, conversationId);
            }
        }
    }

    async sendGmMessage(user, conversationId) {
        let jenkinsStatus = await this.jenkinsStatus.getUpdatedStatus();
        let hasFailedTests = jenkinsStatus.filter(job => job.status !== 'blue').length > 0;

        let message = `Bom dia ${user}, você criou uma GM `;
        if (hasFailedTests) {
            message += 'com os testes *QUEBRADOS!*\n';
        } else {
            message += 'e todos os testes estão passando!\n';
        }
        jenkinsStatus.forEach(job => {
            let status = job.status == 'blue' ? OK : NOT_OK;
            message += `${status}\t-\t${job.name}\n`;
        });
        rtm.sendMessage(message, conversationId);
    }

    async sendJenkinsStatusMessage(user, conversationId) {
        let jenkinsStatus = await this.jenkinsStatus.getUpdatedStatus();

        let message = `Bom dia ${user}, os status do jenkins são:\n`;
        jenkinsStatus.forEach(job => {
            let status = job.status == 'blue' ? OK : NOT_OK;
            message += `${status}\t-\t${job.name}\n`;
        });
        rtm.sendMessage(message, conversationId);
    }

    async getUserList() {
        let response;
        try {
            response = await slackBot.users.list();
        } catch (e) {
            response = e;
        }
        let users = {}
        response.members.forEach(user => {
            users[user.id] = user.name;
        });
        return users;
    }

    async getConversationList() {
        let response = [];
        try {
            response = await slackBot.conversations.list();
        } catch (e) {
            response = e;
        }
        let conversations = {};
        response.channels.forEach(conversation => {
            conversations[conversation.id] = conversation.name;
        });
        return conversations;
    }

    isGmMessage(message) {
        let isGmMessage = false;
        message = message.toLowerCase();

        let containsGM = message.indexOf('gm') !== -1,
            constainsToday = message.indexOf('hoje') !== -1,
            containsCreated = message.indexOf('criada') !== -1;

        return containsGM && (constainsToday || containsCreated);
    }

    isJenkinsStatusMessage(message) {
        let isJenkinsStatusMessage = false;
        message = message.toLowerCase();

        let containsJenkins = message.indexOf('jenkins') !== -1,
            containsStatus = message.indexOf('status') !== -1;

        return containsJenkins && containsStatus;
    }

}

module.exports = Bot;