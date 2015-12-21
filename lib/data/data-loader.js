'use strict';

var _ = require('lodash');
var async = require('async');
var ObjectID = require('mongodb').ObjectID;
var rawbg = require('../plugins/rawbg')();
var dataUtils = require('./data-utils');

var ONE_DAY = 86400000
  , TWO_DAYS = 172800000;

function init (env, ctx) {

  function load(done) {

    var ddata = require('./ddata')();

    console.log('running data.update');
    ddata.lastUpdated = Date.now();

    function loadComplete(err) {
      ddata.treatments = _.uniq(data.treatments, false, function (item) {
        return item._id.toString();
      });

      //sort treatments so the last is the most recent
      ddata.treatments = _.sortBy(data.treatments, function (item) {
        return item.mills;
      });

      dataUtils.updateTreatmentDisplayBGs(ddata);

      if (err) {
        console.error(err);
      }
      done(err, ddata);
    }

    async.parallel([
      loadEntries.bind(null, ddata, ctx)
      , loadTreatments.bind(null, ddata, ctx)
      , loadProfileSwitchTreatments.bind(null, ddata, ctx)
      , loadSensorTreatments.bind(null, ddata, ctx)
      , loadProfile.bind(null, ddata, ctx)
      , loadDeviceStatus.bind(null, ddata, env, ctx)
    ], loadComplete);

  }

  function loadEntries(ddata, ctx, callback) {
    var q = {
      find: {
        date: {
          $gte: data.lastUpdated - TWO_DAYS
        }
      }, sort: {date: 1}
    };

    ctx.entries.list(q, function (err, results) {
      if (!err && results) {
        var mbgs = [];
        var sgvs = [];
        var cals = [];
        results.forEach(function (element) {
          if (element) {
            if (element.mbg) {
              mbgs.push({
                mgdl: Number(element.mbg), mills: element.date, device: element.device
              });
            } else if (element.sgv) {
              sgvs.push({
                mgdl: Number(element.sgv), mills: element.date, device: element.device, direction: element.direction, filtered: element.filtered, unfiltered: element.unfiltered, noise: element.noise, rssi: element.rssi
              });
            } else if (element.type === 'cal') {
              cals.push({
                mills: element.date, scale: element.scale, intercept: element.intercept, slope: element.slope
              });
            }
          }
        });
        ddata.mbgs = dataUtils.uniq(mbgs);
        ddata.sgvs = dataUtils.uniq(sgvs);
        ddata.cals = dataUtils.uniq(cals);
      }
      callback();
    });
  }

  function mergeToTreatments(ddata, results) {
    var treatments = results.map(function (treatment) {
      treatment.mills = new Date(treatment.created_at).getTime();

      return treatment;
    });
    ddata.treatments = _.union(ddata.treatments, treatments);
  }

  function loadTreatments(ddata, ctx, callback) {
    var tq = {
      find: {
        created_at: {
          $gte: new Date(ddata.lastUpdated - (ONE_DAY * 8)).toISOString()
        }
      }, sort: {created_at: 1}
    };

    ctx.treatments.list(tq, function (err, results) {
      if (!err && results) {
        mergeToTreatments(ddata, results);
      }

      callback();
    });
  }

  function loadProfileSwitchTreatments(ddata, ctx, callback) {
    var tq = {
      find: {
        eventType: {
          $eq: 'Profile Switch'
        }, created_at: {
          $gte: new Date(ddata.lastUpdated - (ONE_DAY * 31 * 12)).toISOString()
        }
      }, sort: {created_at: -1}
    };

    ctx.treatments.list(tq, function (err, results) {
      if (!err && results) {
        mergeToTreatments(ddata, results);
      }

      callback();
    });
  }

  function loadSensorTreatments(ddata, ctx, callback) {
    var tq = {
      find: {
        eventType: {
          $in: [ 'Sensor Start', 'Sensor Change']
        }, created_at: {
          $gte: new Date(ddata.lastUpdated - (ONE_DAY * 32)).toISOString()
        }
      }, sort: {created_at: -1}
    };

    ctx.treatments.list(tq, function (err, results) {
      if (!err && results) {
        mergeToTreatments(ddata, results);
      }

      callback();
    });
  }

  function loadProfile(ddata, ctx, callback) {
    ctx.profile.last(function (err, results) {
      if (!err && results) {
        var profiles = [];
        results.forEach(function (element) {
          if (element) {
            profiles[0] = element;
          }
        });
        ddata.profiles = profiles;
      }
      callback();
    });
  }

  function loadDeviceStatus(ddata, env, ctx, callback) {
    var opts = {
      find: {
        created_at: {
          $gte: new Date(data.lastUpdated - TWO_DAYS).toISOString()
        }
      }, sort: {created_at: -1}
    };

    if (env.extendedSettings.devicestatus && env.extendedSettings.devicestatus.advanced) {
      //not adding count: 1 restriction
    } else {
      opts.count = 1;
    }

    ctx.devicestatus.list(opts, function (err, results) {
      if (!err && results) {
        data.devicestatus = _.map(results, function eachStatus(result) {
          result.mills = new Date(result.created_at).getTime();
          if ('uploaderBattery' in result) {
            result.uploader = {
              battery: result.uploaderBattery
            };
            delete result.uploaderBattery;
          }
          return result;
        }).reverse();
      } else {
        ddata.devicestatus = [];
      }
      callback();
    });
  }

  return {
    load: load
  }
}

module.exports = init;