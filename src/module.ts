import { ApmDatasource } from './datasource';
import { ApmQueryCtrl } from './query_ctrl';

class ApmConfigCtrl {
    static templateUrl = 'partials/config.html';
}

class ApmQueryOptionsCtrl {
    static templateUrl = 'partials/query.options.html';
}

export {
    ApmDatasource as Datasource,
    ApmConfigCtrl as ConfigCtrl,
    ApmQueryCtrl as QueryCtrl,
    ApmQueryOptionsCtrl as QueryOptionsCtrl
};
