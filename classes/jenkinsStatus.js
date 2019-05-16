const config = require('../config.json');
const jenkins = require('jenkins')({ baseUrl: `http://${config.username}:${config.password}@jenkins.weg.net:8080`, crumbIssuer: true});

class JenkinsStatus {

    async getUpdatedStatus() {
        let status;
        try {
            status = await this.getViewStatus('MAESTRO');
        } catch (e) {
            status = false;
        }
        return status.jobs.map(job => { return {name: job.name, status: job.color} });
    }

    async getDetailedJobStatus(job) {
        let jobStatus, buildStatus;
        try {
            jobStatus = await this.getJobStatus(job);
            buildStatus = await this.getBuildStatus(job, jobStatus.lastBuild.number);
            if(jobStatus.color.indexOf('blue') === -1) {
                jobStatus.lastSuccessfulBuild = await this.getBuildStatus(job, jobStatus.lastSuccessfulBuild.number);
            } else {
                jobStatus.lastUnsuccessfulBuild = await this.getBuildStatus(job, jobStatus.lastUnsuccessfulBuild.number);
            }
        } catch (e) {
            jobStatus = {};
        }
        return {job: jobStatus, build: buildStatus};
    }

    async getJobNameList() {
        let response = {};
        try {
            response = await this.getViewStatus('MAESTRO');
        } catch (e) {
            response.jobs = {};
        }
        return response.jobs.map(job => job.name);
    }

    getViewStatus(view) {
        return new Promise((resolve, reject) => {
            jenkins.view.get(view, (err, data) => {
                if (err) reject(err);
                resolve(data);
            });
        });
    }

    getJobStatus(job) {
        return new Promise((resolve, reject) => {
            jenkins.job.get(job, (err, data) => {
                if (err) reject(err);
                resolve(data);
            });
        }); 
    }

    getBuildStatus(build, id) {
        return new Promise((resolve, reject) => {
            jenkins.build.get(build, id, (err, data) => {
                if (err) reject(err);
                resolve(data);
            });
        }); 
    }
}

module.exports = JenkinsStatus;