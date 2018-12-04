export default class ApmRawQuery {

    agentRegex: string;
    metricRegex: string;
    temporalResolution: string;
    isAutoEscapingEnabled: boolean;
    aggregationMode: string;

    constructor () {
        this.agentRegex = "";
        this.metricRegex = "";
        this.temporalResolution = "";
        this.isAutoEscapingEnabled = true;
        this.aggregationMode = "none";
    }
}