Ext.define("iteration-scope-change-with-export", {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    scopeType: 'iteration',

    //onScopeChange: function(timebox){
    //    this._addComponents(timebox);
    //    this._updateIterationStatus(timebox);
    //},
    onTimeboxScopeChange: function(timebox){
        this.logger.log('onTimeboxScopeChange', timebox.getQueryFilter().toString());
        this.getContext().setTimeboxScope(timebox);

        this._addComponents(timebox);

        this._loadMatchingIterations(timebox);

        //this._updateApp(timebox);
    },
    _addComponents: function(timebox){
        this.logger.log('_runApp', timebox);

        var labelWidth = 100;

        if (!this.down('#iterationStatusTemplate')){
            this.add(this._getIterationStatusTemplate());
        };

        if (!this.down('#selectedShowWorkScope')){
            this.add(this._getShowWorkRadioGroupConfig(labelWidth));
        }
        if (!this.down('#selectedOrganizeBy')){
            this.add(this._getOrganizeByType(labelWidth));
        }

    },
    _getShowWorkRadioGroupConfig: function(labelWidth){

        return {
            xtype: 'radiogroup',
            fieldLabel: 'Show Work',
            columns: 3,
            itemId: 'selectedShowWorkScope',
            allowBlank: false,
            vertical: false,
            labelWidth: labelWidth,
            margin: '10 0 10 0',
            items: [{
                boxLabel: "All",
                inputValue: 'all',
                name: 'showWorkScope',
                disabled: false,
                checked: true
            },{
                boxLabel: "Added",
                name: 'showWorkScope',
                inputValue: 'added',
                disabled: false,
                checked: false

            },{
                boxLabel: "Removed",
                name: 'showWorkScope',
                inputValue: 'removed',
                disabled: false,
                checked: false

            }],
            listeners: {
                scope: this,
                change: this._updateApp
            }
        };
    },
    _getOrganizeByType: function(labelWidth){
        return {
            xtype: 'radiogroup',
            fieldLabel: 'Organize By',
            itemId: 'selectedOrganizeBy',
            columns: 3,
            allowBlank: false,
            vertical: false,
            labelWidth: labelWidth,
            margin: '10 0 10 0',
            items: [{
                boxLabel: "Project",
                inputValue: 'Project',
                name: 'organizeBy',
                disabled: false,
                checked: true
            },{
                boxLabel: "Day",
                inputValue: 'Day',
                name: 'organizeBy',
                disabled: false,
                checked: false

            }],
            listeners: {
                scope: this,
                change: this._updateApp
            }
        };
    },
    _loadMatchingIterations: function(timebox){
        if (!timebox || !timebox.getRecord()){
            //Todo add message that there is no selected iteration;
            this.logger.log('_loadMatchingIterations no timebox selected');
            return;
        }

        this.logger.log('_loadScopeRevisions', timebox.getQueryFilter().toString());

        var store = Ext.create('Rally.data.wsapi.Store',{
            model: 'Iteration',
            filters: timebox.getQueryFilter().toString(),
            fetch: ['StartDate','Name','EndDate','RevisionHistory','Project'],
            limit: 'Infinity'
        });
        store.load({
            callback: this._loadScopeRevisions,
            scope: this
        });

    },
    _loadScopeRevisions: function(records, operation){
        var deferred = Ext.create('Deft.Deferred'),
            promises = [];

        if (!operation.wasSuccessful()){
            this.logger.log('_loadMatchingIterations failed', operation)
            //Todo alert the user and put a message up
            return;
        }

        if (records.length === 0){
            this.logger.log('_loadScopeRevisions 0 records');
            return;
        }

        _.each(records, function(r){
            promises.push(this._fetchHistory(r));
        }, this);

        Deft.Promise.all(promises).then({
            success: function(revisions){
                this.logger.log('_loadScopeRevisions success', revisions);
                this._updateApp(records, revisions);
            },
            failure: function(msg){
                this.logger.log('_loadScopeRevisions failure', msg);
            },
            scope: this
        });

        return deferred;

    },
    _fetchHistory: function(record){
        var deferred = Ext.create('Deft.Deferred');

        var filter = Ext.create('Rally.data.wsapi.Filter',{
            property:"RevisionHistory",
            value: record.get('RevisionHistory')._ref
        });

        var store = Ext.create('Rally.data.wsapi.Store',{
            model:'Revision',
            filters: filter,
            fetch: ['Description','CreationDate','User'],
            sorters: [{property:'CreationDate',direction:'ASC'}]
        });

        store.load({
            callback: function(records, operation){
                if (operation.wasSuccessful()){
                    deferred.resolve(records);
                } else {
                    deferred.reject(operation.error.errors.join(','));
                }
            }
        });
        return deferred;
    },
    _updateApp: function(records, revisions){
        var timebox = this.getContext().getTimeboxScope(),
            showWorkScope = this.down('#selectedShowWorkScope').getValue().showWorkScope,
            organizeBy = this.down('#selectedOrganizeBy').getValue().organizeBy;
        this.logger.log('_updateApp', showWorkScope, organizeBy);

        this._updateIterationStatus(timebox);

        var parser = Ext.create('Rally.technicalservices.TimeboxHistoryParser',{}),
            activityData = parser.getTimeboxActivityData(records, revisions);

        var artifactFormattedIds = _.pluck(activityData, 'FormattedID');

        this._fetchArtifactData(artifactFormattedIds).then({
            success: function(artifacts){
                var data = parser.aggregateArtifactData(activityData, artifacts);
                this._buildGrid(data, organizeBy);
            },
            failure: function(msg){},
            scope: this
        });



    },
    _buildGrid: function(data, organizeBy){
        if (organizeBy !== 'Day' && organizeBy !== 'Project'){
            organizeBy = 'Day';
        }

        this.logger.log('_buildGrid', data, organizeBy, this._getColumnCfgs());
        var store = Ext.create('Rally.data.custom.Store', {
            data: data,
            groupField: organizeBy,
            groupDir: 'ASC'
        });
        this.add({
            xtype: 'rallygrid',
            features: [{
                ftype: 'groupingsummary',
                groupHeaderTpl: '{name} ({rows.length})'
            }],
            store: store,
            columnCfgs: this._getColumnCfgs()
        });

    },
    _getColumnCfgs: function(){
        return [{
            text: 'Status',
            dataIndex: 'Status',
            flex: 1
            },{
            text: 'FormattedID',
            dataIndex: 'FormattedID',
            flex: 1
        },{
            text: 'Name',
            dataIndex: 'Name',
            flex: 2
        },{
            text: 'Project',
            dataIndex: 'Project',
            flex: 1
        },{
            text: 'Day',
            dataIndex: 'Day',
            flex: 1
        },{
            text: 'Parent',
            dataIndex: 'Parent',
            flex: 1
        },{
            text: 'PlanEstimate',
            dataIndex: 'PlanEstimate',
            flex: 1
        },{
            text: 'User',
            dataIndex: 'User',
            flex: 1
        }];
    },
    _fetchArtifactData: function(artifactFormattedIds){
        var deferred = Ext.create('Deft.Deferred'),
            filters = Rally.data.wsapi.Filter.or(_.map(artifactFormattedIds, function(fid){ return {property: 'FormattedID', value: fid }; }));


        Ext.create('Rally.data.wsapi.artifact.Store', {
            models: ['Defect', 'DefectSuite', 'UserStory','TestSet'],
            fetch: ['FormattedID','Name','Parent','PortfolioItem','Requirement','PlanEstimate'],
            filters: filters,
            limit: 'Infinity'
        }).load({
            callback: function(records, operation){
                deferred.resolve(records);
            },
            scope: this
        });

        return deferred;
    },
    _getIterationStatusTemplate: function(){
        var iterationTemplate = Ext.create('Rally.technicalservices.IterationStatusTemplate',{});
        this.add({
            xtype: 'container',
            flex: 1,
            tpl: iterationTemplate,
            itemId: 'iterationStatusTemplate'
        });
    },
    _updateIterationStatus: function(timebox){
        var data = timebox && timebox.getRecord() && timebox.getRecord().getData() || {};
        this.down('#iterationStatusTemplate').update(data);

    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        Ext.apply(this, settings);
        this.launch();
    }
});
