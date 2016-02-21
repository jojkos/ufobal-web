app.service("dataService", ["$http", "$q", "djangoUrl", "$filter", function($http, $q, djangoUrl, $filter){
    var self = this;
    var data = {};
    var dataMaps = {};
    var deferredTmp = {};
    var dataProcessors = {
        players: function(player){
            player.birthdate = player.birthdate === null ? new Date(player.birthdate) : null;
            player.tournaments = [];
            player.goals = {};
            player.assists = {};
            player.goalsSum = 0;
            player.assistsSum = 0;
            player.canada = 0;
        },
        team: function (team) {
            if (dataMaps.teams[team.pk]){
                return;
            }
            team.matches = [];
            dataMaps.teams[team.pk] = team;
            data.teams.push(team);
            team.teamOnTournaments = [];
            team.medals = [0, 0, 0, 0, 0];
        },
        tournament: function (tournament) {
            if (dataMaps.tournaments[tournament.pk]){
                return;
            }
            tournament.matches = [];
            dataMaps.tournaments[tournament.pk] = tournament;
            data.tournaments.push(tournament);
            tournament.teamOnTournaments = [];
        },
        liveTournament: function(liveTournament){
            if (dataMaps.tournaments[liveTournament.pk]){
                liveTournament = dataMaps.tournaments[liveTournament.pk];
                return;
            }
            data.liveTournament = liveTournament;
            dataProcessors.tournament(liveTournament);
        },
        teamontournaments: function(teamOnTournament){
            teamOnTournament.matches = [];
            // create and link teams
            dataProcessors.team(teamOnTournament.team);
            dataMaps.teams[teamOnTournament.team.pk].teamOnTournaments.push(teamOnTournament);
            if (teamOnTournament.rank < 6) {
                dataMaps.teams[teamOnTournament.team.pk].medals[teamOnTournament.rank - 1] += 1;
            }

            // create and link tournaments
            dataProcessors.tournament(teamOnTournament.tournament);
            dataMaps.tournaments[teamOnTournament.tournament.pk].teamOnTournaments.push(teamOnTournament);

            // link players
            teamOnTournament.players = [];
            angular.forEach(teamOnTournament.player_pks, function(playerPk){
                var player = dataMaps.players[playerPk];
                player.tournaments.push(teamOnTournament);
                teamOnTournament.players.push(player);
                if (playerPk === teamOnTournament.captain){
                    teamOnTournament.captain = player;
                }
                if (playerPk === teamOnTournament.default_goalie){
                    teamOnTournament.defaultGoalie = player;
                }
            });
        },
        matchs: function (match) {
            match.tournament = self.getObject("tournaments", match.tournament);
            match.team_one = self.getObject("teamontournaments", match.team_one);
            match.team_two = self.getObject("teamontournaments", match.team_two);
            match.referee = self.getObject("players", match.referee);
            match.start = match.start === null ? new Date(match.start) : null;
            match.end = match.end === null ? new Date(match.end) : null;

            match.tournament.matches.push(match);
            match.team_one.matches.push(match);
            match.team_two.matches.push(match);
        }
    };

    var getData = function(object){
        if (deferredTmp[object]){
            return deferredTmp[object].promise;
        }
        var deferred = $q.defer();
        if (data[object]){
            deferred.resolve(data[object]);
            return deferred.promise;
        }
        deferredTmp[object] = deferred;
        if (object === "teams" || object === "tournaments"){
            getData("teamontournaments");
        } else if(object === "goals") {
            getGoals();
        } else {
            getDataFromServer(object, deferred);
        }
        return deferred.promise;
    };

    var resolvePromise = function(object){
        if (deferredTmp[object]) {
            deferredTmp[object].resolve(data[object]);
            deferredTmp[object] = null;
        }
    };

    var rejectPromise = function(object, response, status){
        if (deferredTmp[object]) {
            deferredTmp[object].reject("Error: request returned status " + status + " and message " + response);
            deferredTmp[object] = null;
        }
    };

    var getDataFromServer = function(object){
        $http.get(djangoUrl.reverse("api:get_" + object))
            .success(function(response){
                data[object] = response;
                dataMaps[object] = {};
                if (object === "teamontournaments") {
                    data.teams = [];
                    dataMaps.teams = {};
                    if (!dataMaps.tournaments){
                        data.tournaments = [];
                        dataMaps.tournaments = {};
                    }
                    getData("players").then(function(){
                        angular.forEach(response, function(obj) {
                            dataMaps[object][obj.pk] = obj;
                            dataProcessors[object](obj);
                        });
                        angular.forEach(data.teams, function(team) {
                            self.getTeamNames(team);
                        });
                        angular.forEach(data.players, function(player) {
                            self.getPlayerTeams(player);
                        });
                    });
                }else if (object === "liveTournament"){
                    if (!dataMaps.tournaments){
                        data.tournaments = [];
                        dataMaps.tournaments = {};
                    }else{
                        data.liveTournament = dataMaps.tournaments[response.pk];
                    }
                    dataProcessors[object](response);
                }else if (object === "matchs"){
                    self.getTeams().then(function() {
                        self.getPlayers().then(function() {
                            angular.forEach(response, function (obj) {
                                dataMaps[object][obj.pk] = obj;
                                dataProcessors[object](obj);
                            });
                        });
                    });
                }else{
                    angular.forEach(response, function(obj) {
                        dataMaps[object][obj.pk] = obj;
                        dataProcessors[object](obj);
                    });
                }
                if (object === "teamontournaments"){
                    resolvePromise("teams");
                    resolvePromise("tournaments");
                }
                resolvePromise(object);
            })
            .error(function (response, status, headers, config) {
                rejectPromise(object, response, status);
                if (object === "teamontournaments"){
                    rejectPromise("teams", response, status);
                    rejectPromise("tournaments", response, status);
                }
            });
    };

    var getGoals = function(){
        $http.get(djangoUrl.reverse("api:get_goals"))
            .success(function(response) {
                data.goals = response;
                getData("players").then(function(){
                    angular.forEach(response.goals, function(goals) {
                        var player = dataMaps.players[goals.shooter];
                        player.goals[goals.match__tournament] = goals.count;
                        player.goalsSum += goals.count;
                        player.canada += goals.count;
                    });
                    angular.forEach(response.assists, function(assists) {
                        var player = dataMaps.players[assists.assistance];
                        player.assists[assists.match__tournament] = assists.count;
                        player.assistsSum += assists.count;
                        player.canada += assists.count;
                    });
                    resolvePromise("goals");
                });
            })
            .error(function (response, status, headers, config) {
                rejectPromise("goals", response, status);
            });
    };

    self.getPlayers = function(){
        var r = getData("players");
        getData("teamontournaments");
        return r;
    };
    self.getTeams = function(){
        getData("players");
        return getData("teams");
    };
    self.getTournaments = function(){
        getData("players");
        return getData("tournaments");
    };
    self.getGoals = function(){
        getData("players");
        return getData("goals");
    };
    self.getLiveTournament = function(){
        self.getTeams();
        return getData("liveTournament");
    };
    self.getMatches = function () {
        return getData("matchs");
    };

    self.getObject = function(object, id){
        if (typeof id === "object"){
            return id;
        }
        if (!dataMaps[object]){
            return null;
        }
        return dataMaps[object][id];
    };

    self.addTeam = function(newTeam){
        newTeam.saving = true;
        return $http.post(djangoUrl.reverse("api:add_team"), newTeam)
            .success(function (pk) {
                newTeam.saving = false;
                newTeam.pk = parseInt(pk);
                dataProcessors.team(newTeam);
            })
            .error(function () {
                newTeam.saving = false;
            });
    };

    self.addPlayer = function(player){
        player.saving = true;
        var player_to_save = shallow_copy(player);
        player_to_save.birthdate = $filter('date')(player.birthdate, "yyyy-MM-dd");
        return $http.post(djangoUrl.reverse("api:add_player"), player_to_save)
            .success(function (pk) {
                player.saving = false;
                player.pk = parseInt(pk);
                dataProcessors.players(player);
                data.players.push(player);
                dataMaps.players[pk] = player;
            })
            .error(function () {
                player.saving = false;
            });
    };

    self.addTeamOnTournament = function (registration) {
        registration.saving = true;
        if (registration.name === ""){
            delete  registration.name;
        }
        return $http.post(djangoUrl.reverse("api:add_team_on_tournament"), registration)
            .success(function (pk) {
                registration.saving = false;
                var team = dataMaps.teams[registration.team];
                var teamOnTournament = {
                    pk: parseInt(pk),
                    team: team,
                    name: registration.name ? registration.name + " (" + team.name + ")" : team.name,
                    name_pure: registration.name ? registration.name : team.name,
                    tournament: dataMaps.tournaments[registration.tournament],
                    players: []
                };
                dataMaps.tournaments[registration.tournament].teamOnTournaments.push(teamOnTournament);
                team.teamOnTournaments.push(teamOnTournament);
            })
            .error(function () {
                registration.saving = false;
            });
    };

    self.addAttendance = function(player, team){
        player.saving = true;
        return $http.post(djangoUrl.reverse("api:add_attendance"), { player: player.pk, team: team.pk})
            .success(function(){
                if (player.tournaments.indexOf(team) === -1){
                    player.tournaments.push(team);
                }
                if (team.players.indexOf(player) === -1){
                    team.players.push(player);
                }
                player.saving = false;
            })
            .error(function(){
                player.saving = false;
            });
    };

    self.removeAttendance = function(player, team){
        player.saving = true;
        return $http.delete(djangoUrl.reverse("api:remove_attendance", [player.pk, team.pk]))
            .success(function(){
                player.tournaments.splice(player.tournaments.indexOf(team), 1);
                team.players.splice(team.players.indexOf(player), 1);
                player.saving = false;
            })
            .error(function(){
                player.saving = false;
            });
    };

    self.setCaptain = function (teamOnTournament) {
        return $http.post(djangoUrl.reverse("api:set_captain"), {player: teamOnTournament.captain.pk, team: teamOnTournament.pk});
    };

    self.setDefaultGoalie = function (teamOnTournament) {
        return $http.post(djangoUrl.reverse("api:set_default_goalie"), {player: teamOnTournament.defaultGoalie.pk, team: teamOnTournament.pk});
    };

    self.savePlayer = function(player){
        player.saving = true;
        var player_to_save = shallow_copy(player);
        player_to_save.birthdate = $filter('date')(player.birthdate, "yyyy-MM-dd");
        return $http.post(djangoUrl.reverse("api:save_player"), player_to_save)
            .success(function(response){
                player.saving = false;
            })
            .error(function (response) {
                player.saving = false;
            });
    };

    self.getPlayerTeams = function(player){
        if (!player){
            return;
        }
        if (player.teams){
            var sum = 0;
            angular.forEach(player.teams, function(team) {
                sum += team.count;
            });
            if (sum === player.tournaments.length) {
                return player.teams;
            }
        }
        var teams = [];
        var teamsSearch = [];
        var pkMap = {};
        angular.forEach(player.tournaments, function(teamOnTournament){
            if (typeof pkMap[teamOnTournament.team.pk] !== "number"){
                pkMap[teamOnTournament.team.pk] = teams.length;
                teams.push({
                    team: teamOnTournament.team,
                    count: 0
                });
                teamsSearch += teamOnTournament.team.name + "###";
            }
        teams[pkMap[teamOnTournament.team.pk]].count += 1;
        });
        player.teams = teams;
        player.teamsSearch = teamsSearch;
        return teams;
    };

    self.getTeamNames = function(team){
        if (!team){
            return;
        }
        if (team.names){
            var sum = 0;
            angular.forEach(team.names, function(name) {
                sum += name.count;
            });
            if (sum === team.teamOnTournaments.length) {
                return team.names;
            }
        }
        var names = [];
        var pkMap = {};
        var namesSearch = "";
        angular.forEach(team.teamOnTournaments, function(teamOnTournament){
            if (typeof  pkMap[teamOnTournament.name] !== "number"){
                pkMap[teamOnTournament.name] = names.length;
                names.push({
                    name: teamOnTournament.name_pure,
                    count: 0
                });
                namesSearch += teamOnTournament.name_pure + "###";
            }
            names[pkMap[teamOnTournament.name]].count += 1;
        });
        team.names = names;
        team.namesSearch = namesSearch;
        return names;
    };

    self.getScoreWithoutTeam = function(player){
        if (!player){
            return;
        }
        var withGoal = $.map(Object.keys(player.goals), function (x){ return parseInt(x); });
        var withAssists = $.map(Object.keys(player.assists), function (x){ return parseInt(x); });
        var participations = unique($.merge(withGoal, withAssists));
        var tournaments = $.map(player.tournaments, function(x){return x.tournament.pk; });
        angular.forEach(tournaments, function(pk){
            var index = participations.indexOf(pk);
            if (index > -1) {
                participations.splice(index, 1);
            }
        });
        if (player.scoreWithoutTeam && player.scoreWithoutTeam.length === participations.length){
            return player.scoreWithoutTeam;
        }
        tournaments = $.map(participations, function(x) { return self.getObject("tournaments", x); });
        player.scoreWithoutTeam = tournaments;
        return tournaments;
    };

    var stats = null;
    self.getStats = function () {
        var deferred = $q.defer();
        if (stats){
            deferred.resolve(stats);
            return deferred.promise;
        }
        $http.get(djangoUrl.reverse("api:get_stats"))
            .success(function (response) {
                stats = response;
                deferred.resolve(response);
            });
        return deferred.promise;
    };

    self.addMatch = function (match) {
        match.saving = true;
        return $http.post(djangoUrl.reverse("api:add_match"), {
            tournament: match.tournament.pk,
            team_one: match.team_one.pk,
            team_two: match.team_two.pk
        }).success(function (pk) {
            match.pk = parseInt(pk);
            match.tournament.matches.push(match);
            match.team_one.matches.push(match);
            match.team_two.matches.push(match);
            match.saving = false;
            dataMaps.matchs[pk] = match.pk;
            data.matchs.push(match);
        }).error(function () {
            match.saving = false;
        });
    };

    self.saveMatch = function (match) {
        match.saving = true;
        return $http.post(djangoUrl.reverse("api:edit_match", {match_id: match.pk}), shallow_copy(match))
            .success(function () {
                match.saving = false;
            }).error(function () {
                match.saving = false;
            });
    };

    self.saveEvent = function(event, type) {
        if (!event.pk){
            event.saving = true;
            return $http.post(djangoUrl.reverse("api:add_"+type), shallow_copy(event, true))
                .success(function (pk) {
                    event.saving = false;
                    event.pk = parseInt(pk);
                })
                .error(function () {
                    event.saving = false;
                });
        }else{
            console.log("Not implemented");
        }
    };

    self.goalieChange = function(goalieChange){
        goalieChange.saving = true;
        return $http.post(djangoUrl.reverse("api:change_goalie", {
            match_id: goalieChange.match.pk,
            team_id: goalieChange.team.pk
        }), shallow_copy(goalieChange, true))
            .success(function () {
                goalieChange.saving = false;
            })
            .error(function () {
                goalieChange.saving = false;
            });
    };
}]);

var genders = [
    {id: 'man', text: "muž"},
    {id: 'woman', text: "žena"}
];

var cards = [
    {id: 'yellow', text: "žlutá"},
    {id: 'red', text: "červená"}
];