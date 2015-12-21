'use strict';

require('should');

describe('Data Utils', function ( ) {

  var env = require('../env')();
  var ctx = {};
  var dataUtils = require('../lib/data/data-utils');

  var now = Date.now();
  var before = now - (5 * 60 * 1000);


  it('should return original data if there are no changes', function() {
    var ddata = require('../lib/data/ddata')();
    ddata.sgvs = [{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    var delta = dataUtils.calculateDeltaBetweenDatasets(ddata, ddata);
    delta.should.equal(ddata);
  });

  it('adding one sgv record should return delta with one sgv', function() {
    var ddata = require('../lib/data/ddata')();
    ddata.sgvs = [{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    var newData = ddata.clone();
    newData.sgvs = [{mgdl: 100, mills:101},{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    var delta = dataUtils.calculateDeltaBetweenDatasets(ddata, newData);
    delta.delta.should.equal(true);
    delta.sgvs.length.should.equal(1);
  });

  it('adding one treatment record should return delta with one treatment', function() {
    var ddata = require('../lib/data/ddata')();
    ddata.treatments = [{_id: 'someid_1', mgdl: 100, mills: before},{_id: 'someid_2', mgdl: 100, mills: now}];
    var newData = ddata.clone();
    newData.treatments = [{_id: 'someid_1', mgdl: 100, mills: before},{_id: 'someid_2', mgdl: 100, mills: now},{_id: 'someid_3', mgdl: 100, mills:98}];
    var delta = dataUtils.calculateDeltaBetweenDatasets(ddata, newData);
    delta.delta.should.equal(true);
    delta.treatments.length.should.equal(1);
  });

  it('changes to treatments, mbgs and cals should be calculated even if sgvs is not changed', function() {
    var ddata = require('../lib/data/ddata')();
    ddata.sgvs = [{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    ddata.treatments = [{_id: 'someid_1', mgdl: 100, mills: before},{_id: 'someid_2', mgdl: 100, mills: now}];
    ddata.mbgs = [{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    ddata.cals = [{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    var newData = ddata.clone();
    newData.sgvs = [{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    newData.treatments = [{_id: 'someid_3', mgdl: 100, mills:101},{_id: 'someid_1', mgdl: 100, mills: before},{_id: 'someid_2', mgdl: 100, mills: now}];
    newData.mbgs = [{mgdl: 100, mills:101},{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    newData.cals = [{mgdl: 100, mills:101},{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    var delta = dataUtils.calculateDeltaBetweenDatasets(ddata, newData);
    delta.delta.should.equal(true);
    delta.treatments.length.should.equal(1);
    delta.mbgs.length.should.equal(1);
    delta.cals.length.should.equal(1);
  });

  it('delta should include profile', function() {
    var ddata = require('../lib/data/ddata')();
    ddata.sgvs = [{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    ddata.profiles = {foo:true};
    var newData = ddata.clone();
    newData.sgvs = [{mgdl: 100, mills:101},{mgdl: 100, mills: before},{mgdl: 100, mills: now}];
    newData.profiles = {bar:true};
    var delta = dataUtils.calculateDeltaBetweenDatasets(ddata, newData);
    delta.profiles.bar.should.equal(true);
  });

  it('update treatment display BGs', function() {
    var ddata = require('../lib/data/ddata')();
    ddata.sgvs = [{mgdl: 90, mills: before},{mgdl: 100, mills: now}];
    ddata.treatments = [
      {_id: 'someid_1', mills: before, glucose: 100, units: 'mgdl'} //with glucose and units
      , {_id: 'someid_2', mills: before, glucose: 5.5, units: 'mmol'} //with glucose and units
      , {_id: 'someid_3', mills: now - 120000, insulin: '1.00'} //without glucose, between sgvs
      , {_id: 'someid_4', mills: now + 60000, insulin: '1.00'} //without glucose, after sgvs
      , {_id: 'someid_5', mills: before - 120000, insulin: '1.00'} //without glucose, before sgvs
    ];
    dataUtils.updateTreatmentDisplayBGs(ddata);
    ddata.treatments[0].mgdl.should.equal(100);
    ddata.treatments[1].mmol.should.equal(5.5);
    ddata.treatments[2].mgdl.should.equal(95);
    ddata.treatments[3].mgdl.should.equal(100);
    ddata.treatments[4].mgdl.should.equal(90);
  });

});