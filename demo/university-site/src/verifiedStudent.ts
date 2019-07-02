import request from 'request'

/** 
 * Forms a credential from a student DID, assuming the student is Alice
 */
export async function formVerifiedStudent(studentDid: string): Promise<any> {

    const agentUrl = process.env.ENTERPRISE_AGENT_ENDPOINT + `?did=${studentDid}`;

    try {
        return await SendGet(agentUrl);
    } catch (error) {
        console.error(error);
    }
}

// Helper function for sending HTTP POST in async/await style
async function SendGet(url: string) {
  return new Promise(function (resolve, reject) {
    request(url, function (error, res, body) {
      if (!error && res.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
}