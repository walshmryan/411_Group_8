var express = require('express');
var router = express.Router();
var request = require('request');
var rp = require('request-promise');
var mongoose = require('mongoose');
var fs = require('fs');
mongoose.connect('mongodb://localhost/cs411a2');

//command when mongo misbehaving:  brew services start mongodb

var Schema = mongoose.Schema;
var artist = new Schema({
    artist: String,
    bio: String,
    songs: [],
    danceability: String,
    energy: String,
    speechiness: String,
    tempo: String,
    popularity: String

}, {
    strict: 'throw' //throw error when invalid track attempted
});

var userData = new Schema({
    topArtists: []

}, {
    strict: 'throw' //throw error when invalid track attempted
});

var tune = mongoose.model('tune', artist);
var userTop = mongoose.model('userTop', userData);

var LastFmNode = require('lastfm').LastFmNode;

var lastfm = new LastFmNode({
    api_key: '5a63919effc53c56e941641ca870cdc6',
    secret: fs.readFileSync('./../../fm_key.txt', 'utf8') // Client secret in local text file for security
});

var client_id = '75a1c00129ce4975a7c787d2658ec88c'; // Your client id
var client_secret = fs.readFileSync('./../../spotify_key.txt', 'utf8'); // Your client secret
var redirect_uri = 'http://localhost:3000/callback'; // Your redirect uri

// requests authorization
var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
    },
    form: {
        grant_type: 'client_credentials'
    },
    json: true
};

/* GET users listing. */

router.get('/', function(req, res, next) {
    res.send('use /users/db');
});

router.post('/db', function(req, res, next) {
    var tune1 = new tune(req.body);
    tune1.save(function (err) {
        if (err) { console.log(err);}
        else {
            res.json({message: 'Successful posting'});
        }
    });
});

router.post('/db/userTop', function(req, res, next) {
    var userTop1 = new userTop(req.body);
    userTop1.save(function (err) {
        if (err) { console.log(err);}
        else {
            res.json({message: 'Successful top posting'});
        }
    });
});

router.get('/db', function(req, res, next) {

    tune.find({}, function (err, results) {
        res.json(results);
    });

});

router.get('/db/userTop', function(req, res, next) {

    userTop.find({}, function (err, results) {
        res.json(results);
    });

});


router.get('/db/topTracks/:artist', function(req, res, next) {
    var top50 = [];
    var songsRequest = lastfm.request("artist.getTopTracks", {
        artist: req.params.artist,
        handlers: {
            success: function(data) {
                console.log('Artist Top50 Success');

                var top50 = [];
                //may run into error if there are less than 50 songs
                for (var i = 0; i < 5; i++) {
                    top50.push(data.toptracks.track[i].name);
                }

                res.json(top50);

            },
            error: function(error) {
                console.log("Error: " + error.message);
            }
        }
    });

});


router.get('/db/features/:ids', function(req, res, next) {

    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {

            // use the access token to access the Spotify Web API
            var token = body.access_token;
            var options = {
                url: 'https://api.spotify.com/v1/audio-features/?ids=' + req.params.ids,
                headers: {
                    'Authorization': 'Bearer ' + token
                },
                json: true
            };

            request.get(options, function(error, response, body) {
                if(error) {
                    console.log('Error geting audio features');
                    console.log(error);
                } else {
                    res.json(body);
                }
            });
        }
    });
});


router.get('/db/lookupTrack/:songName', function(req, res, next) {

    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {

            trackName = req.params.songName;
            trackName = trackName.split(' ').join('+');
            console.log('Looking up: ' + trackName);


            // use the access token to access the Spotify Web API
            var token = body.access_token;
            var options = {
                url: 'https://api.spotify.com/v1/search?q=' + trackName + '&type=track',
                headers: {
                    'Authorization': 'Bearer ' + token
                },
                json: true
            };

            request.get(options, function(error, response, body) {
                console.log('Audio Features Success');
                res.json(body);
            });
        }
    });
});



router.get('/db/artistInfo/:artist', function(req, res, next) {

    var infoRequest = lastfm.request("artist.getInfo", {
        artist: req.params.artist,
        handlers: {
            success: function(data) {
                artistName = data.artist.name;
                artistPlays = data.artist.stats.listeners;

                console.log('Artist Info Success');

                res.json(data);

            },
            error: function(error) {
                console.log("Error: " + error.message);
            }
        }
    });
});


router.get('/db/:artist', function(req, res, next) {


    tune.find({artist: req.params.artist}, function (err, results) {

        //if not in DB already, go get it
        if(Object.keys(results).length === 0) {

            var artistName = req.params.artist;
            console.log(artistName + " Not Found In DB");


            var artistInfo = {
                method: 'GET',
                url: 'http://localhost:3000/users/db/artistInfo/' + artistName
            };

            var topTracks = { method: 'GET',
                url: 'http://localhost:3000/users/db/topTracks/' + artistName
            };


            /* Dependencies */
            var Promise = require('bluebird');
            var reqP = Promise.promisifyAll(require('request-promise'));

            reqP(artistInfo)
                .then(function(infoResults) {
                    var info = JSON.parse(infoResults);

                    return [info];

                })
                .then(function(data) {

                    return reqP(topTracks)
                        .then(function(results) {

                            var tracks = JSON.parse(results);
                            data.push(tracks);

                            return data;
                        })
                        .catch(function(err) {
                            console.log('Error retrieving ' + artistName);
                        });
                })
                .then(function(data) {

                    var trackList = data[1];

                    //get songs into proper search format
                    var song = trackList[0].split(' ').join('+');

                    var id = {
                        method: 'GET',
                        url: 'http://localhost:3000/users/db/lookupTrack/' + song
                    };

                    return reqP(id)
                        .then(function(results) {

                            var spotifyTrack = JSON.parse(results);

                            data.push(spotifyTrack.tracks.items[0].id);
                            return data;

                        })
                        .catch(function(err) {
                            console.log('Error retrieving ' + artistName);
                        });

                })
                .then(function(data) {

                    var trackList = data[1];

                    //get songs into proper search format
                    var song = trackList[1].split(' ').join('+');

                    var id = {
                        method: 'GET',
                        url: 'http://localhost:3000/users/db/lookupTrack/' + song
                    };

                    return reqP(id)
                        .then(function(results) {

                            var spotifyTrack = JSON.parse(results);

                            data.push(spotifyTrack.tracks.items[0].id);
                            return data;

                        })
                        .catch(function(err) {
                            console.log('Error retrieving ' + artistName);
                        });

                })
                .then(function(data) {

                    var trackList = data[1];

                    //get songs into proper search format
                    var song = trackList[2].split(' ').join('+');

                    var id = {
                        method: 'GET',
                        url: 'http://localhost:3000/users/db/lookupTrack/' + song
                    };

                    return reqP(id)
                        .then(function(results) {

                            var spotifyTrack = JSON.parse(results);

                            data.push(spotifyTrack.tracks.items[0].id);
                            return data;

                        })
                        .catch(function(err) {
                            console.log('Error retrieving ' + artistName);
                        });

                })
                .then(function(data) {


                    var audioFeatures = { method: 'GET',
                        url: 'http://localhost:3000/users/db/features/' + data[2] + ',' + data[3] + ',' + data[4]
                    };

                    return reqP(audioFeatures)
                        .then(function(results) {

                            var features = JSON.parse(results);

                            var d1 = parseFloat(features.audio_features[0].danceability);
                            var d2 = parseFloat(features.audio_features[1].danceability);
                            var d3 = parseFloat(features.audio_features[2].danceability);

                            var dAvg = (d1 + d2 + d3) /3.0;

                            var e1 = parseFloat(features.audio_features[0].energy);
                            var e2 = parseFloat(features.audio_features[1].energy);
                            var e3 = parseFloat(features.audio_features[2].energy);

                            var eAvg = (e1 + e2 + e3) /3.0;

                            var s1 = parseFloat(features.audio_features[0].speechiness);
                            var s2 = parseFloat(features.audio_features[1].speechiness);
                            var s3 = parseFloat(features.audio_features[2].speechiness);

                            var sAvg = (s1 + s2 + s3) /3.0;

                            var t1 = parseFloat(features.audio_features[0].tempo);
                            var t2 = parseFloat(features.audio_features[1].tempo);
                            var t3 = parseFloat(features.audio_features[2].tempo);

                            var tAvg = (t1 + t2 + t3) /3.0;

                            data.push([dAvg, eAvg, sAvg, tAvg]);
                            return data;

                        })
                        .catch(function(err) {
                            console.log('Error retrieving all IDs for ' + artistName);
                        });

                })
                .then(function(data) {

                    var bio = data[0].artist.bio.summary;
                    var songs = data[1];
                    var danceability = data[5][0];
                    var energy = data[5][1];
                    var speechiness = data[5][2];
                    var tempo = data[5][3];
                    var popularity = data[0].artist.stats.listeners;

                    var options = { method: 'POST',
                        url: 'http://localhost:3000/users/db',
                        form: {
                            artist: artistName,
                            bio: bio,
                            songs: songs,
                            danceability: danceability,
                            energy: energy,
                            speechiness: speechiness,
                            tempo: tempo,
                            popularity: popularity
                        }
                    };

                    request(options, function (error, response, body) {
                        if (error) throw new Error(error);

                        console.log(body);
                    });

                })
                .then(function() {

                    tune.find({artist: req.params.artist}, function (err, results) {
                        res.json(results);
                    });

                })
                .catch(function(err) {
                    throw err;
                });
        }
        else {
            res.json(results);
        }

    });
});

module.exports = router;
