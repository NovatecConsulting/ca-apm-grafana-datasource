// @ts-ignore
import * as kbn from 'app/core/utils/kbn';
import ApmRawQuery from './apmrawquery'

export class ApmDatasource {

    url: string;
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

                    const query: ApmRawQuery = target.rawQuery;

                    let agentRegex = "" || query.agentRegex;
                    let metricRegex = "" || query.metricRegex;
                    let dataFrequency = "" || query.temporalResolution;
                    const aggregationMode = "" || query.aggregationMode;
                    const seriesAlias = "" || query.seriesAlias;
                    const aliasRegex = "" || query.aliasRegex;

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
                        const options = {
                            aggregationMode: aggregationMode,
                            seriesAlias: seriesAlias,
                            aliasRegex: aliasRegex
                        }
                        this.parseResponseData(response.data, grafanaResponse, options);
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
                const xml = this.parser.parseFromString(response.data, "text/xml");
                if (xml.getElementsByTagName("wsdl:service")[0].getAttribute("name") === "MetricsDataService") {
                    return { status: 'success', message: 'Data source is working, found Metrics Data Web Service', title: 'Success' };
                }
            }

            return { status: 'failure', message: 'Data source is not working: ' + response.status, title: 'Failure' };
        });
    }

    private parseResponseData(responseData: string, grafanaResponse: any, options: any) {
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
        let metrics = {};
        const legendSeparator = "|";
        const aggregations = {
            sum: metricValues => metricValues.reduce((sum, metricValue) => sum += metricValue, 0),
            mean: metricValues => metricValues.reduce((sum, metricValue) => sum += metricValue, 0) / metricValues.length,
            max: metricValues => metricValues.reduce((a, b) => Math.max(a, b)),
            min: metricValues => metricValues.reduce((a, b) => Math.min(a, b)),
            median: metricValues => this.quickselect_median(metricValues)
        };
        let references: Array<any>;

        // first process the time slices
        for (let i = 0; i < returnCount; i++) {

            const slice = rawArray[i];
            const rawReferences = slice.childNodes[0].childNodes;
            references = [];

            // for IE compatibility, don't use forEach here
            for(let j = 0; j < rawReferences.length; j++) {
                references.push(+rawReferences[j].getAttribute("href").split("#id")[1]);
            }

            slices.push({
                id: i + 1,
                references: references,
                endTime: Date.parse(slice.childNodes[1].textContent)
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
                value = +rawMetricDataPoint.childNodes[3].textContent;

                // collect values into map, drop NaN values
                if (!isNaN(value)) {

                    let metricKey = rawMetricDataPoint.childNodes[0].textContent + legendSeparator + rawMetricDataPoint.childNodes[1].textContent;

                    metricData[id] = {
                        metricKey: metricKey,
                        metricValue: value
                    }
                }
            }
        };

        // for each time slice, collect all referenced data points
        slices.forEach(function (slice) {
            var dataPoints: [MetricPoint] = slice.references
                .reduce((dataPoints, reference) => {
                    const dataPoint = metricData[reference];
                    if (typeof dataPoint != "undefined") {
                        dataPoints.push(dataPoint);
                    }
                    return dataPoints;
                }, [])

            // post processing: if configured, aggregate all time series
            if (/^sum|mean|max|min|median$/.test(options.aggregationMode)) {
                const aggregate = aggregations[options.aggregationMode](dataPoints.map((dataPoint: MetricPoint) => dataPoint.metricValue));

                dataPoints = [{
                    metricKey: !options.seriesAlias || /^\s*$/.test(options.seriesAlias) ? options.aggregationMode : options.seriesAlias,
                    metricValue: aggregate
                }];
            }

            dataPoints.forEach((dataPoint: MetricPoint) => {
                metrics[dataPoint.metricKey] = metrics[dataPoint.metricKey] || [];
                metrics[dataPoint.metricKey].push([dataPoint.metricValue, slice.endTime]);
            })
        }, this)

        // post processing: if configured, alias metric keys / series names
        if (!/^sum|mean|max|min|median$/.test(options.aggregationMode) && !/^\s*$/.test(options.seriesAlias) && !/^\s*$/.test(options.aliasRegex)) {

            const aliasedMetrics = {};
            let cancelAliasing = false;

            for (const originalMetricKey of Object.keys(metrics)) {

                const originalMetricValues = metrics[originalMetricKey];
                const aliasedMetricKey = originalMetricKey.replace(RegExp(options.aliasRegex, "g"), options.seriesAlias);

                if (!(aliasedMetricKey in aliasedMetrics)) {
                    // aliased key does not exist
                    aliasedMetrics[aliasedMetricKey] = originalMetricValues;
                } else {
                    // aliased key already exists, abort
                    console.log("aliasing canceled, aliased series name is not unique within query");
                    cancelAliasing = true;
                    break;
                }
            }

            // if aliasing was successful, continue processing witht the aliased metrics
            if (!cancelAliasing) {
                metrics = aliasedMetrics;
            }
        }

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

        grafanaResponse.data.sort((a, b) => +(a.target > b.target) || -(a.target < b.target));
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
                const rawAgentPaths = xml.getElementsByTagName("ns1:listAgentsResponse")[0].childNodes[0].childNodes;

                // for IE compatibility, don't use forEach here
                for(let i = 0; i < rawAgentPaths.length; i++) {
                    agentPaths.push(rawAgentPaths[i].textContent);
                }

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

    // Source:
    // https://rcoh.me/posts/linear-time-median-finding/
    private quickselect_median(numbers: number[]) {
        if (numbers.length % 2 == 1) {
            return this.quickselect(numbers, numbers.length / 2);
        } else {
            return 0.5 * (this.quickselect(numbers, numbers.length / 2 - 1) +
                          this.quickselect(numbers, numbers.length / 2));
        }
    }

    private quickselect(numbers: number[], elementIndex: number) {
    
        if (numbers.length == 1) {
            return numbers[0];
        }        

        const pivot = numbers[Math.floor((Math.random()*numbers.length))];
        const lows: number[] = [];
        const highs: number[] = [];
        const pivots: number[] = [];

        numbers.forEach((number: number) => {
            if (number < pivot) {
                lows.push(number);
            } else if (number == pivot) {
                pivots.push(number);
            } else {
                highs.push(number);
            }
        });

        if (elementIndex < lows.length) {
            return this.quickselect(lows, elementIndex);
        } else if (elementIndex < (lows.length + pivots.length)) {
            return pivots[0];
        } else {
            return this.quickselect(highs, elementIndex - lows.length - pivots.length);
        }
    }
}

interface Target {
    rawQuery: ApmRawQuery;
    isRawQueryModeEnabled: boolean;
    hide: boolean;
}

interface MetricPoint {
    metricKey: string;
    metricValue: number;
}