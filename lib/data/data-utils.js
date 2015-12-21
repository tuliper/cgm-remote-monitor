'use strict';

var _ = require('lodash');

var utils = { };

utils.uniq = function uniq(a) {
  var seen = {};
  return a.filter(function (item) {
    return seen.hasOwnProperty(item.mills) ? false : (seen[item.mills] = true);
  });
};

utils.calculateDelta = function calculateDelta(lastData) {
  return utils.calculateDeltaBetweenDatasets(lastData, data);
};

utils.calculateDeltaBetweenDatasets = function calculateDeltaBetweenDatasets(oldData, newData) {

  var delta = {'delta': true};
  var changesFound = false;

  // if there's no updates done so far, just return the full set
  if (!oldData.sgvs) {
    return newData;
  }

  function nsArrayTreatments(oldArray, newArray) {
    var result = [];

    // check for add, change
    var l = newArray.length;
    var m = oldArray.length;
    var found, founddiff, no, oo, i, j;
    for (i = 0; i < l; i++) {
      no = newArray[i];
      found = false;
      founddiff = false;
      for (j = 0; j < m; j++) {
        oo = oldArray[j];
        no._id = no._id.toString();
        if (no._id === oo._id) {
          found = true;
          if (!_.isEqual(oo, no)) {
            founddiff = true;
          }
          break;
        }
      }
      if (founddiff) {
        var nno = _.cloneDeep(no);
        nno.action = 'update';
        result.push(nno);
      }
      if (!found) {
        result.push(no);
      }
    }

    //check for delete
    for (j = 0; j < m; j++) {
      oo = oldArray[j];
      found = false;
      for (i = 0; i < l; i++) {
        no = newArray[i];
        if (no._id === oo._id) {
          found = true;
          break;
        }
      }
      if (!found) {
        result.push({ _id: oo._id, action: 'remove' });
      }
    }

    return result;
  }

  function nsArrayDiff(oldArray, newArray) {
    var seen = {};
    var l = oldArray.length;
    for (var i = 0; i < l; i++) {
      seen[oldArray[i].mills] = true;
    }
    var result = [];
    l = newArray.length;
    for (var j = 0; j < l; j++) {
      if (!seen.hasOwnProperty(newArray[j].mills)) {
        result.push(newArray[j]);
      }
    }
    return result;
  }

  function sort(values) {
    values.sort(function sorter(a, b) {
      return a.mills - b.mills;
    });
  }

  function compressArrays(delta, newData) {
    // array compression
    var compressibleArrays = ['sgvs', 'treatments', 'mbgs', 'cals', 'devicestatus'];
    var changesFound = false;

    for (var array in compressibleArrays) {
      if (compressibleArrays.hasOwnProperty(array)) {
        var a = compressibleArrays[array];
        if (newData.hasOwnProperty(a)) {

          // if previous data doesn't have the property (first time delta?), just assign data over
          if (!oldData.hasOwnProperty(a)) {
            delta[a] = newData[a];
            changesFound = true;
            continue;
          }

          // Calculate delta and assign delta over if changes were found
          var deltaData = (a === 'treatments' ? nsArrayTreatments(oldData[a], newData[a]) : nsArrayDiff(oldData[a], newData[a]));
          if (deltaData.length > 0) {
            console.log('delta changes found on', a);
            changesFound = true;
            sort(deltaData);
            delta[a] = deltaData;
          }
        }
      }
    }
    return {'delta': delta, 'changesFound': changesFound};
  }

  function deleteSkippables(delta, newData) {
    // objects
    var skippableObjects = ['profiles'];
    var changesFound = false;

    for (var object in skippableObjects) {
      if (skippableObjects.hasOwnProperty(object)) {
        var o = skippableObjects[object];
        if (newData.hasOwnProperty(o)) {
          if (JSON.stringify(newData[o]) !== JSON.stringify(oldData[o])) {
            console.log('delta changes found on', o);
            changesFound = true;
            delta[o] = newData[o];
          }
        }
      }
    }
    return {'delta': delta, 'changesFound': changesFound};
  }

  delta.lastUpdated = newData.lastUpdated;

  var compressedDelta = compressArrays(delta, newData);
  delta = compressedDelta.delta;
  if (compressedDelta.changesFound) {
    changesFound = true;
  }

  var skippedDelta = deleteSkippables(delta, newData);
  delta = skippedDelta.delta;
  if (skippedDelta.changesFound) {
    changesFound = true;
  }

  if (changesFound) {
    return delta;
  }
  return newData;

};

utils.updateTreatmentDisplayBGs = function updateTreatmentDisplayBGs(ddata) {
  function updateTreatmentBG(treatment) {

    function mgdlByTime() {

      var withBGs = _.filter(ddata.sgvs, function (d) {
        return d.mgdl > 39 || env.settings.isEnabled('rawbg');
      });

      var beforeTreatment = _.findLast(withBGs, function (d) {
        return d.mills <= treatment.mills;
      });
      var afterTreatment = _.find(withBGs, function (d) {
        return d.mills >= treatment.mills;
      });

      var mgdlBefore = mgdlValue(beforeTreatment) || calcRaw(beforeTreatment);
      var mgdlAfter = mgdlValue(afterTreatment) || calcRaw(afterTreatment);

      var calcedBG = 0;
      if (mgdlBefore && mgdlAfter) {
        calcedBG = (mgdlBefore + mgdlAfter) / 2;
      } else if (mgdlBefore) {
        calcedBG = mgdlBefore;
      } else if (mgdlAfter) {
        calcedBG = mgdlAfter;
      }

      return calcedBG || 400;
    }

    function mgdlValue(entry) {
      return entry && entry.mgdl >= 39 && Number(entry.mgdl);
    }

    function calcRaw(entry) {
      var raw;
      if (entry && env.settings.isEnabled('rawbg')) {
        var cal = _.last(ddata.cals);
        if (cal) {
          raw = rawbg.calc(entry, cal);
        }
      }
      return raw;
    }

    if (treatment.glucose && isNaN(treatment.glucose)) {
      console.warn('found an invalid glucose value', treatment);
    } else if (treatment.glucose && treatment.units) {
      if (treatment.units === 'mmol') {
        treatment.mmol = Number(treatment.glucose);
      } else {
        treatment.mgdl = Number(treatment.glucose);
      }
    } else if (treatment.glucose) {
      //no units, assume everything is the same
      console.warn('found a glucose value without any units, maybe from an old version?', _.pick(treatment, '_id', 'created_at', 'enteredBy'));
      var units = env.DISPLAY_UNITS === 'mmol' ? 'mmol' : 'mgdl';
      treatment[units] = Number(treatment.glucose);
    } else {
      treatment.mgdl = mgdlByTime();
    }
  }

  _.each(ddata.treatments, updateTreatmentBG);

};

module.exports = utils;