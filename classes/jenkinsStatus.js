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

    getViewStatus(view) {
        return new Promise((resolve, reject) => {
            jenkins.view.get(view, (err, data) => {
                if (err) reject(err);
                resolve(data);
            });
        });
    }
}

module.exports = JenkinsStatus;