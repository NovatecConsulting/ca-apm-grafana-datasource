"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var datasource_1 = require("./datasource");
exports.Datasource = datasource_1.ApmDatasource;
var query_ctrl_1 = require("./query_ctrl");
exports.QueryCtrl = query_ctrl_1.ApmQueryCtrl;
var ApmConfigCtrl = /** @class */ (function () {
    function ApmConfigCtrl() {
    }
    ApmConfigCtrl.templateUrl = 'partials/config.html';
    return ApmConfigCtrl;
}());
exports.ConfigCtrl = ApmConfigCtrl;
var ApmQueryOptionsCtrl = /** @class */ (function () {
    function ApmQueryOptionsCtrl() {
    }
    ApmQueryOptionsCtrl.templateUrl = 'partials/query.options.html';
    return ApmQueryOptionsCtrl;
}());
exports.QueryOptionsCtrl = ApmQueryOptionsCtrl;
