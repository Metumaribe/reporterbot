import fs from 'fs';
import path from 'path';

import { log, delay, getReportFilesDir } from '../../utils';
import { postChatMessage, uploadFile } from '../slack';

// Reports
import getUserActivity from './getUserActivity';

const REPORTS_CONFIG = {
  userActivity: {
    name: 'User Activity',
    namePrefix: 'userActivity',
    type: 'csv',
    func: getUserActivity,
  },
};

export const reportsList = Object.entries(REPORTS_CONFIG)
  .map(([key, value]) => { // eslint-disable-line
    return {
      text: value.name,
      value: key,
    };
  });

const checkIfReportExists = async (reportPath) => {
  let reportExists = true;
  try {
    fs.accessSync(reportPath);
  } catch (ex) {
    if (ex.code === 'ENOENT') {
      reportExists = false;
    } else {
      log.error(ex);
    }
  }

  return reportExists;
};

const generateReportImpl = async (options, { slackReqObj }) => {
  const {
    reportName,
    reportTmpName,
    reportType,
    reportFactoryFunc,
  } = options;

  try {
    await reportFactoryFunc();
    const reportFilesDir = getReportFilesDir();
    const reportFilePath = path.join(reportFilesDir, reportTmpName);

    /*
      FIX ME::
      Delay hack to ensure previous fs call is done processing file
    */
    await delay(250);
    const reportExists = await checkIfReportExists(reportFilePath);

    if (reportExists === false) {
      const message = {
        responseUrl: slackReqObj.response_url,
        replaceOriginal: false,
        text: `There's currently no data for report *${reportName}*`,
        mrkdwn: true,
        mrkdwn_in: ['text'],
      };
      return postChatMessage(message)
        .catch((ex) => {
          log.error(ex);
        });
    }

    /*
      FIX ME::
      Delay hack to ensure previous fs call is done processing file
    */
    await delay(500);
    const uploadedReport = await uploadFile({
      filePath: reportFilePath,
      fileTmpName: reportTmpName,
      fileName: reportName,
      fileType: reportType,
    });
    const message = {
      responseUrl: slackReqObj.response_url,
      replaceOriginal: false,
      text: 'Your report is ready!',
      attachments: [{
        text: `<${uploadedReport.file.url_private}|${reportName}>`,
        color: '#2c963f',
        footer: 'Click report link to open menu with download option',
      }],
    };
    return postChatMessage(message)
      .catch((err) => {
        log.error(err);
      });
  } catch (err) {
    log.error(err);
    const message = {
      responseUrl: slackReqObj.response_url,
      replaceOriginal: false,
      text: `Well this is embarrassing :sweat: I couldn't successfully get the report *${reportName}*. Please try again later as I look into what went wrong.`,
      mrkdwn: true,
      mrkdwn_in: ['text'],
    };
    return postChatMessage(message)
      .catch((exception) => {
        log.error(exception);
      });
  }
};

export const generateReport = async (options) => {
  try {
    const {
      slackReqObj,
    } = options;

    const reportKey = slackReqObj.actions[0].selected_options[0].value;
    const report = REPORTS_CONFIG[reportKey];

    if (report === undefined) {
      const response = {
        response_type: 'in_channel',
        text: 'Hmmm :thinking_face: Seems like that report is not available.',
      };
      return response;
    }

    if (reportKey === 'userActivity') {
      const reportName = report.name;
      const reportTmpName = `${report.namePrefix}_${Date.now()}.${report.type}`;
      const reportType = report.type;

      const reportParams = {
        reportName,
        reportTmpName,
        reportType,
        reportFactoryFunc() {
          return report.func({
            reportTmpName,
          });
        },
      };

      // Fire of report generation
      generateReportImpl(reportParams, { slackReqObj });
    }

    const response = {
      response_type: 'in_channel',
      text: `Got it :thumbsup: Generating requested report *${report.name}*\nPlease carry on, I'll notify you when I'm done.`,
      mrkdwn: true,
      mrkdwn_in: ['text'],
    };

    return response;
  } catch (err) {
    throw err;
  }
};
