export default class ApmRawQuery {

    agentRegex: string;
    metricRegex: string;
    temporalResolution: string;
    isAutoEscapingEnabled: boolean;

    constructor () {
        this.agentRegex = "";
        this.metricRegex = "";
        this.temporalResolution = "";
        this.isAutoEscapingEnabled = true;
    }
}