'use strict';

var _ = require('lodash');

function init (client) {
  var ddata = require('./ddata')();

  function prepDisplayEntries() {
    // Post processing after data is in

    var cal = _.last(ddata.cals);

    var rawbgs = [ ];
    if (cal && client.rawbg.isEnabled(client.sbx)) {
      rawbgs = ddata.sgvs.map(function (entry) {
        var rawbgValue = client.rawbg.showRawBGs(entry.mgdl, entry.noise, cal, client.sbx) ? client.rawbg.calc(entry, cal, client.sbx) : 0;
        if (rawbgValue > 0) {
          return { mills: entry.mills - 2000, mgdl: rawbgValue, color: 'white', type: 'rawbg' };
        } else {
          return null;
        }
      }).filter(function (entry) {
        return entry !== null;
      });
    }

    var sgvs = ddata.sgvs.map(function (entry) {
      var color = entry.mgdl < 39 ? 'transparent' : client.sgvToColor(entry.mgdl);
      return { mills: entry.mills, mgdl: entry.mgdl, direction: entry.direction, color: color, type: 'sgv', noise: entry.noise, filtered: entry.filtered, unfiltered: entry.unfiltered};
    });

    var mbgs = ddata.mbgs.map(function (obj) {
      return { mills: obj.mills, mgdl: obj.mgdl, color: 'red', type: 'mbg', device: obj.device };
    });

    client.data = [].concat(rawbgs, sgvs, mbgs);

  }

  ddata.update = function update(d) {

    if (!d) {
      return;
    }

    // Calculate the diff to existing data and replace as needed
    ddata.sgvs = mergeDataUpdate(d.delta, ddata.sgvs, d.sgvs);
    ddata.mbgs = mergeDataUpdate(d.delta, ddata.mbgs, d.mbgs);
    ddata.treatments = mergeTreatmentUpdate(d.delta, ddata.treatments, d.treatments);


    // Resend new treatments to profile
    client.profilefunctions.updateTreatments(client.profileTreatments, client.tempbasalTreatments, client.combobolusTreatments);


    // Do some reporting on the console
    console.log('Total SGV data size', ddata.sgvs.length);
    console.log('Total treatment data size', ddata.treatments.length);

    if (d.profiles) {
      ddata.profile = require('../profilefunctions')();
      ddata.profile.loadData(ddata.profiles);
    }

    ddata.cals = mergeDataUpdate(d.delta, ddata.cals, d.cals);

    if (d.devicestatus) {
      if (client.settings.extendedSettings.devicestatus && client.settings.extendedSettings.devicestatus.advanced) {
        //only use extra memory in advanced mode
        ddata.devicestatus = mergeDataUpdate(d.delta, ddata.devicestatus, d.devicestatus);
      } else {
        ddata.devicestatus = d.devicestatus;
      }
    }

    if (d.sgvs) {
      // change the next line so that it uses the prediction if the signal gets lost (max 1/2 hr)
      ddata.lastUpdated = Date.now();
      ddata.sgvs.latest = ddata.sgvs[ddata.sgvs.length - 1];
      ddata.sgvs.prev = ddata.sgvs.length > 1 ? ddata.sgvs[ddata.sgvs.length - 2] : undefined;
    }

    prepDisplayEntries();

  };

  function mergeTreatmentUpdate(isDelta, cachedDataArray, receivedDataArray) {

    // If there was no delta data, just return the original data
    if (!receivedDataArray) {
      return cachedDataArray || [];
    }

    // If this is not a delta update, replace all data
    if (!isDelta) {
      return receivedDataArray || [];
    }

    // check for update, change, remove
    var l = receivedDataArray.length;
    var m = cachedDataArray.length;
    for (var i = 0; i < l; i++) {
      var no = receivedDataArray[i];
      if (!no.action) {
        cachedDataArray.push(no);
        continue;
      }
      for (var j = 0; j < m; j++) {
        if (no._id === cachedDataArray[j]._id) {
          if (no.action === 'remove') {
            cachedDataArray.splice(j, 1);
            break;
          }
          if (no.action === 'update') {
            delete no.action;
            cachedDataArray.splice(j, 1, no);
            break;
          }
        }
      }
    }

    // If this is delta, calculate the difference, merge and sort
    return cachedDataArray.sort(function (a, b) {
      return a.mills - b.mills;
    });
  }

  function mergeDataUpdate(isDelta, cachedDataArray, receivedDataArray) {

    function nsArrayDiff(oldArray, newArray) {
      var seen = {};
      var l = oldArray.length;
      for (var i = 0; i < l; i++) {
        seen[oldArray[i].mills] = true
      }
      var result = [];
      l = newArray.length;
      for (var j = 0; j < l; j++) {
        if (!seen.hasOwnProperty(newArray[j].mills)) {
          result.push(newArray[j]);
          console.log('delta data found');
        }
      }
      return result;
    }

    // If there was no delta data, just return the original data
    if (!receivedDataArray) {
      return cachedDataArray || [];
    }

    // If this is not a delta update, replace all data
    if (!isDelta) {
      return receivedDataArray || [];
    }

    // If this is delta, calculate the difference, merge and sort
    var diff = nsArrayDiff(cachedDataArray, receivedDataArray);
    return cachedDataArray.concat(diff).sort(function (a, b) {
      return a.mills - b.mills;
    });
  }
}

module.exports = init;

