// @ts-ignore
import * as kbn from 'app/core/utils/kbn';
import ApmRawQuery from './apmrawquery'

export class ApmDatasource {

    url: string;
    x2js: any;
    parser: any;

    soapHead: string = '<soapenv:Envelope xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\" xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:met=\"http://metricslist.webservicesimpl.server.introscope.wily.com\"><soapenv:Header/><soapenv:Body>';
    soapTail: string= '</soapenv:Body></soapenv:Envelope>';

    constructor(instanceSettings, private $q, private backendSrv, private templateSrv) {
        
        this.url = instanceSettings.url;
        this.templateSrv = templateSrv;

        if ((<any>window).DOMParser) {
            this.parser = new DOMParser();
        }
    }

    query(options) {

        const startTime = options.range.from.toISOString();
        const endTime = options.range.to.toISOString();
        const grafanaResponse = { data: [] };

        const requests = options.targets.map((target: Target) => {

            return new Promise((resolve) => {
                if (target.hide || !target.rawQuery) {
                    resolve();
                } else {

                    let query: ApmRawQuery = target.rawQuery;

                    let agentRegex = "" || query.agentRegex;
                    let metricRegex = "" || query.metricRegex;
                    let dataFrequency = "" || query.temporalResolution;

                    if (!(agentRegex && metricRegex && dataFrequency)) {
                        resolve();
                    }

                    // escape common metric path characters ("|", "(", ")")
                    if (query.isAutoEscapingEnabled){
                        agentRegex = this.escapeQueryString(agentRegex);
                        metricRegex = this.escapeQueryString(metricRegex);
                    }

                    // replace variables
                    agentRegex = this.templateSrv.replace(agentRegex, options.scopedVars, 'regex');
                    metricRegex = this.templateSrv.replace(metricRegex, options.scopedVars, 'regex');
                    dataFrequency = this.templateSrv.replace("" + dataFrequency, options.scopedVars, 'regex');

                    let headers = {
                        "SOAPAction": "getMetricData",
                        "Content-Type": "text/xml"
                    };

                    let dataFrequencyInSeconds = kbn.interval_to_seconds(dataFrequency)
                    dataFrequencyInSeconds = dataFrequencyInSeconds - (dataFrequencyInSeconds % 15);
                    if (dataFrequencyInSeconds == 0) {
                        dataFrequencyInSeconds = 15;
                    }

                    this.backendSrv.datasourceRequest({
                        url: this.url + '/introscope-web-services/services/MetricsDataService',
                        method: 'POST',
                        headers: headers,
                        data: this.getSoapBodyForMetricsQuery(agentRegex, metricRegex, startTime, endTime, dataFrequencyInSeconds)
                    }).then((response) => {                        
                        this.parseResponseData(response.data, grafanaResponse);
                        resolve();
                    })
                }
            });
        });

        return Promise.all(requests).then(() => {
            return grafanaResponse;
        });
    }

    metricFindQuery(query) {
        if (query.lastIndexOf("Agents|", 0) === 0) {
            const agentRegex = query.substring(7);
            return this.getAgentSegments(agentRegex).then((agents) => {
                return agents.map(agent => {
                    return { text: agent };
                });
            });
        } else if (query.lastIndexOf("Metrics|", 0) === 0) {
            const metricRegex = query.substring(8);
            return this.getMetricSegments(".*", metricRegex).then((metrics) => {
                return metrics.map(metric => {
                    return { text: metric };
                });
            });
        } else {
            return Promise.resolve([]);
        }
    }

    testDatasource() {

        return this.backendSrv.datasourceRequest({
            url: this.url + '/introscope-web-services/services/MetricsDataService?wsdl',
            method: 'GET',
            
        }).then((response) => {            
            if (response.status === 200) {
                const jsonResponseData = this.x2js.xml_str2json(response.data);
                if (jsonResponseData.definitions.service._name === "MetricsDataService") {
                    return { status: 'success', message: 'Data source is working, found Metrics Data Web Service', title: 'Success' };
                }
            }

            return { status: 'failure', message: 'Data source is not working: ' + response.status, title: 'Failure' };
        });
    }

    private parseResponseData(responseData: string, grafanaResponse: any) {
        //let rawArray;
        let returnCount: number;
        let rawArray;
        try {

            const xml = this.parser.parseFromString(responseData, "text/xml");
            returnCount = xml.getElementsByTagName("ns1:getMetricDataResponse")[0].childNodes[0].childNodes.length;

            if (returnCount != 0) {
                // response array is not empty
                rawArray = xml.getElementsByTagName("multiRef")
            } else {
                // response array was empty
                return grafanaResponse;
            }
        } catch (exception) {
            console.log("Cannot parse query response:");
            console.log(exception);
            return grafanaResponse;
        }

        const slices = [];
        const metricData: { [key: number]: Object } = {};
        const metrics = {};
        const legendSeparator = "|";
        let references: Array<any>;

        // first process the time slices
        for (let i = 0; i < returnCount; i++) {

            const slice = rawArray[i];
            references = [];

            slice.childNodes[0].childNodes.forEach(function (x) {
                references.push(+x.getAttribute("href").split("#id")[1]);
            })

            slices.push({
                id: i + 1,
                references: references,
                endTime: Date.parse(slice.childNodes[1].innerHTML)
            })
        };
        
        // then collect the actual data points into a map
        for (let i = returnCount; i < rawArray.length; i++) {

            const rawMetricDataPoint = rawArray[i];
            const id = rawMetricDataPoint.getAttribute("id").split("id")[1];
            let value = null;

            // handle missing values explicitly           
            if (!(rawMetricDataPoint.childNodes[3].getAttribute("xsi:nil") === "true")) {
                // we have a value, convert to int implicitly
                value = +rawMetricDataPoint.childNodes[3].innerHTML;
            }

            metricData[id] = {
                agentName: rawMetricDataPoint.childNodes[0].innerHTML,
                metricName: rawMetricDataPoint.childNodes[1].innerHTML,
                metricValue: value
            }
        };

        // for each time slice, collect all referenced data points
        slices.forEach(function (slice) {
            slice.references.forEach(function (reference) {
                const dataPoint = metricData[reference] as MetricPoint;
                metrics[dataPoint.agentName + legendSeparator + dataPoint.metricName] = metrics[dataPoint.agentName + legendSeparator + dataPoint.metricName] || [];
                metrics[dataPoint.agentName + legendSeparator + dataPoint.metricName].push([dataPoint.metricValue, slice.endTime]);
            })
        })

        // sort the data points for proper line display in Grafana and add all series to the response
        Object.keys(metrics).forEach(function (metric) {
            metrics[metric].sort(function (a, b) {
                return a[1] - b[1];
            })
            grafanaResponse.data.push({
                target: metric,
                datapoints: metrics[metric]
            });
        })
    }

    private escapeQueryString(queryString) {
        return (queryString + '').replace(new RegExp('[|()]', 'g'), '\\$&')
    }

    private getSoapBodyForMetricsQuery(agentRegex: string, metricRegex: string, startTime: string, endTime: string, dataFrequency: string): string {
        return this.soapHead
            + '<met:getMetricData soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><agentRegex xsi:type="xsd:string">'
            + agentRegex
            + '</agentRegex><metricRegex xsi:type="xsd:string">'
            + metricRegex
            + '</metricRegex><startTime xsi:type="xsd:dateTime">'
            + startTime
            + '</startTime><endTime xsi:type="xsd:dateTime">'
            + endTime
            + '</endTime><dataFrequency xsi:type="xsd:int">'
            + dataFrequency
            + '</dataFrequency></met:getMetricData></soapenv:Body></soapenv:Envelope>'
    }

    getAgentSegments(agentRegex) {
        const preprocessedAgentRegex = this.escapeQueryString(this.templateSrv.replace(agentRegex));
        const headers = {
            "SOAPAction": "listAgents",
            "Content-Type": "text/xml"
        };

        return this.backendSrv.datasourceRequest({
            url: this.url + '/introscope-web-services/services/MetricsListService',
            method: 'POST',
            headers: headers,
            data: this.soapHead
                + "<met:listAgents soapenv:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><agentRegex xsi:type=\"xsd:string\">"
                + preprocessedAgentRegex
                + ".*"
                + "</agentRegex></met:listAgents></soapenv:Body></soapenv:Envelope>"
        }).then((response) => {
            if (response.status === 200) {
                const xml = this.parser.parseFromString(response.data, "text/xml");
                const agentPaths = [];

                xml.getElementsByTagName("ns1:listAgentsResponse")[0].childNodes[0].childNodes.forEach(function (x) {
                    agentPaths.push(x.textContent);
                });

                return agentPaths;
            } else {
                return [];
            }
        }).catch((error) => {
            return [];
        });
    }

    getMetricSegments(agentRegex, metricRegex) {
        const preprocessedAgentRegex = this.escapeQueryString(this.templateSrv.replace(agentRegex));
        const preprocessedMetricRegex = this.escapeQueryString(this.templateSrv.replace(metricRegex));
        const headers = {
            "SOAPAction": "listMetrics",
            "Content-Type": "text/xml"
        };

        return this.backendSrv.datasourceRequest({
            url: this.url + '/introscope-web-services/services/MetricsListService',
            method: 'POST',
            headers: headers,
            data: this.soapHead
                + "<met:listMetrics soapenv:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><agentRegex xsi:type=\"xsd:string\">"
                + preprocessedAgentRegex
                + ".*"
                + "</agentRegex><metricRegex xsi:type=\"xsd:string\">"
                + preprocessedMetricRegex
                + ".*"
                + "</metricRegex></met:listMetrics></soapenv:Body></soapenv:Envelope>"
        }).then((response) => {
            if (response.status === 200) {
                const metricPaths = [];                
                const xml = this.parser.parseFromString(response.data, "text/xml");

                const collection = xml.getElementsByTagName("multiRef");

                for(let i = 0; i < collection.length; i++) {
                    const item = collection.item(i);
                    metricPaths.push(item.childNodes[1].textContent);
                }

                return metricPaths;
            } else {
                return [];
            }
        }).catch((error) => {
            console.log(error)
            return [];
        });
    }
}

interface Target {
    rawQuery: ApmRawQuery;
    isRawQueryModeEnabled: boolean;
    hide: boolean;
}

interface MetricPoint {
    agentName: String;
    metricName: String;
    metricValue: String;
}