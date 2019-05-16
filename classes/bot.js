const token = require('../config.json').jenkinsToken;
const JenkinsStatusClass = require('./jenkinsStatus');
const { RTMClient } = require('@slack/rtm-api');
const { WebClient } = require('@slack/web-api');
const rtm = new RTMClient(token);
const slackBot = new WebClient(token);
const jenkinsStatus = new JenkinsStatusClass();
const moment = require('moment');

const JENKINS_ENDPOINT = require('../config.json').jenkinsEndpoint;
const OK = ':heavy_check_mark:';
const NOT_OK = ':x:';
const BUILDING = ':hammer:';
const POINT = ':point_right::skin-tone-2:';
const EMOJI = {
    'icon-health-00to19': ':thunder_cloud_and_rain:',
    'icon-health-20to39': ':rain_cloud:',
    'icon-health-40to59': ':cloud:',
    'icon-health-60to79': ':partly_sunny:',
    'icon-health-80plus': ':sunny:',
}

class Bot {

    constructor() {
        this.conversations = {};
        this.users = {};
        this.jobs = [];
    }

    async start() {
        this.conversations = await this.getConversationList();
        this.users = await this.getUserList();
        this.jobs = await jenkinsStatus.getJobNameList();
        this.jenkinsStatus = jenkinsStatus;
        this.moment = moment;

        if (this.conversations) {
            console.log('Successfully got the conversations list');
        }
        if (this.users) {
            console.log('Successfully got the user list');
        }
        if (this.jobs) {
            console.log('Successfully got the jobs list');
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
            console.log(`Received: ${message}\nFrom user: ${user}\nIn conversation: ${this.conversations[conversationId] || 'private'}\n-------------`);
            if (this.isGmMessage(message)) {
                this.sendGmMessage(user, conversationId);
            } else if (this.isJenkinsStatusMessage(message)) {
                this.sendJenkinsStatusMessage(user, conversationId);
            } else if (this.isJobNameMessage(message)) {
                this.sendJobDetailedStatus(this.getJobFromMessage(message), user, conversationId);
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
            message += this.getStatusMessage(job);
        });
        rtm.sendMessage(message, conversationId);
    }

    async sendJenkinsStatusMessage(user, conversationId) {
        let jenkinsStatus = await this.jenkinsStatus.getUpdatedStatus();

        let message = `Bom dia ${user}, os status do jenkins são:\n`;
        jenkinsStatus.forEach(job => {
            message += this.getStatusMessage(job);
        });
        rtm.sendMessage(message, conversationId);
    }

    async sendJobDetailedStatus(job, user, conversationId) {
        let status = await this.jenkinsStatus.getDetailedJobStatus(job),
            message = this.getDetailedJobMessage(status, user);
        rtm.sendMessage(message, conversationId);
    }

    getDetailedJobMessage(status, user) {
        let message = `Bom dia ${user}, o job ${status.job.displayName} está `;
        if (status.job.color.indexOf('blue') !== -1) {
            message += this.getSuccessfullJobMessage(status);
        } else {
            message += this.getFailedJobMessage(status);
        }
        return message;
    }

    getSuccessfullJobMessage(status) {
        let message = '';
        message += `*passando* há ${moment(status.job.lastUnsuccessfulBuild.timestamp).fromNow()} ${OK}\n\n`;
        message += this.getHealthReportMessage(status.job.healthReport);
        return message;
    }

    getFailedJobMessage(status) {
        let message = '';

        message += `*quebrado* há ${moment(status.job.lastSuccessfulBuild.timestamp).fromNow()} ${NOT_OK}\n\n`;
        message += this.getHealthReportMessage(status.job.healthReport);
        message += this.getBlameMessage(status.build);

        return message;
    }

    getBlameMessage(build) {
        let message = '\tOs *culpados* são:\n';
        for(const culprit of build.culprits) {
            let user = culprit.absoluteUrl.replace(JENKINS_ENDPOINT+'/user/', ''),
                userCode = this.getUserCode(user);

            message += `\t\t${POINT} <@${userCode}>\n`;
        }

        return message;
    }

    getHealthReportMessage(healthReport) {
        let message = '';

        message += '\tHealth Report:\n';
        for (const health of healthReport) {
            message += `\t\t${EMOJI[health.iconClassName]}\t${health.description}\n`;
        }
        return message;
    }

    getStatusMessage(job) {
        let message = '',
            status = job.status.indexOf('blue') !== -1 ? OK : NOT_OK;
        if (job.status.indexOf('anime') !== -1) {
            status += BUILDING + '\t - ';
        } else {
            status += '\t\t  - ';
        }
        message = status + job.name + '\n';
        return message;
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

    getJobFromMessage(message) {
        let jobName;

        for (const job of this.jobs) {
            if (message.indexOf(job) !== -1) {
                jobName = job;
                break;
            }
        }

        return jobName;
    }

    isGmMessage(message) {
        message = message.toLowerCase();

        let containsGM = message.indexOf('gm') !== -1,
            constainsToday = message.indexOf('hoje') !== -1,
            containsCreated = message.indexOf('criada') !== -1;

        return containsGM && (constainsToday || containsCreated);
    }

    isJenkinsStatusMessage(message) {
        message = message.toLowerCase();

        let containsJenkins = message.indexOf('jenkins') !== -1,
            containsStatus = message.indexOf('status') !== -1;

        return containsJenkins && containsStatus;
    }

    isJobNameMessage(message) {
        message = message.toLowerCase();
        let isJobNameMessage = false;

        for (const job of this.jobs) {
            if (message.indexOf(job) !== -1) {
                isJobNameMessage = true;
                break;
            }
        }

        return isJobNameMessage
    }

    getUserCode(user) {
        return Object.keys(this.users).find(key => this.users[key] === user);
    }

}

module.exports = Bot;