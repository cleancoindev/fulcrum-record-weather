var express = require('express');
var Fulcrum = require('fulcrum-app');
var models = require('fulcrum-models');
var fulcrumMiddleware = require('connect-fulcrum-webhook');
var Forecast = require('forecast.io');

var app = express();

var form;
var formId = '3f45825d-f123-46d0-927c-925db4a63618';
var forecastApiKey = process.env.FORECAST_API_KEY;
var fulcrumApiKey = process.env.FULCRUM_API_KEY;

var forecast = new Forecast({ APIKey: forecastApiKey });
var fulcrum = new Fulcrum({ api_key: fulcrumApiKey });

var fulcrumWeatherFields = {
  summary: 'wx_summary',
  temperature: 'wx_air_temperature',
  humidity: 'wx_relative_humidity',
  pressure: 'wx_barometric_pressure'
}

fulcrum.forms.find(formId, function (error, response) {
  if (error) {
    return console.log('Error fetching form: ', error);
  }

  form = new models.Form(response.form);
});

function payloadProcessor (payload, done) {
  if (payload.data.form_id !== formId) {
    return done();
  }

  var record = new models.Record(payload.data);
  record.setForm(form);

  var latitude        = record.get('latitude');
  var longitude       = record.get('longitude');
  var clientCreatedAt = record.get('client_created_at');
  var date            = new Date(clientCreatedAt);
  var unixTimestamp   = date.getTime() / 1000;
  var exclude         = 'minutely,hourly,daily,alerts,flags';
  var forecastOptions = { exclude: exclude, units: 'si' };

  if (!(latitude && longitude)) {
    console.log('Skipping record because latitude and/or longitude is missing. Latitude: ' + latitude + '. Longitude: ' + longitude + '.');
    return done();
  }

  forecast.getAtTime(latitude, longitude, unixTimestamp, forecastOptions, function (error, res, data) {
    if (error) {
      return done(error);
    }

    var currentWeather = data.currently;

    Object.keys(fulcrumWeatherFields).forEach(function (metric) {
      if (currentWeather[metric]) {
        record.updateFieldByDataName(fulcrumWeatherFields[metric], currentWeather[metric].toString());
        //fulcrumRecord.record.form_values[fulcrumWeatherFields[metric].key] = currentWeather[metric].toString();
      }
    });

    fulcrum.records.update(record.get('id'), record.toJSON(), function (error, resp) {
      if (error) {
        return done(error);
      }
      done();
    });
  });
}

var fulcrumConfig = {
  actions: ['record.create'],
  processor: payloadProcessor
};

app.use('/fulcrum', fulcrumMiddleware(fulcrumConfig));

var port = (process.env.PORT || 5000);
app.listen(port, function () {
  console.log('Listening on port ' + port);
});
