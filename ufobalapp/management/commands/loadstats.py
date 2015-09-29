#!/usr/bin/python
# -*- coding: UTF-8 -*-
#python3

from django.core.management.base import BaseCommand, CommandError
# from django.templatetags.static import static
from ufobalapp.models import Player, Team, Goal, Tournament, Match, TeamOnTournament
import json
import os
from collections import Counter, defaultdict
from datetime import datetime

class Command(BaseCommand):
    help = 'nahrava do databaze ufobalove staty z json ziskaneho prikazem parsestats NEJDRIV BRNO STRELCI, PAK ASISTENCE A PAK NIZKOV to stejny'

    def add_arguments(self, parser):
        parser.add_argument('statsfile', nargs=1, type=str, help='ufobalove staty v json')


    def handle(self, *args, **options):
        shooters = False
        assistence = False
        nizkov = False
        brno = False

        for filename in options['statsfile']:
            if filename.split('-')[1].split('.')[0] == 'strelci':
                shooters = True
            else:
                assistence = True

            if filename == 'nizkov-strelci.json':
                shouldadd = True

            if filename.split('-')[0] == 'brno':
                brno = True
            else:
                nizkov = True

            if shooters and brno:
                #testovaci mazani vseho pokazde
                Player.objects.all().delete()
                Team.objects.all().delete()
                Goal.objects.all().delete()
                Tournament.objects.all().delete()



            with open(os.path.join('data_source', filename), 'r') as statsfile:
                stats = json.load(statsfile)
                name = filename.split('-')[0]
                for datestring in stats['dates']:
                    date = datetime.strptime(datestring, '%d.%m.%Y').date()
                    #created==False znamena ze uz byl driv vytvoren
                    tournament, created = Tournament.objects.get_or_create(name=name, date=date)
                    #fake zapas pro vsechny strely/asistence na turnaji
                    match, created = Match.objects.get_or_create(tournament=tournament, fake=True)

                namecounter = {}
                for player in stats['players']:
                    namecounter.setdefault(player['name'], 0)
                    namecounter[player['name']] += 1

                for player in stats['players']:
                    #vytvoreni hrace
                    playerobj, created = Player.objects.get_or_create(nickname=player['name'])

                    #pokud existuje hrac se stejnym jmenem
                    if not created and shooters and brno: #u strelcu se vytvari ruzni hraci, u asistenci uz se to jen doplnuje
                        playerobj, created = Player.objects.get_or_create(nickname=player['name']+"-"+player['team'])
                    elif not created and nizkov and shooters:
                        #pokud je jen jednou, priradi se uz k existujicimu brnenskemu, jinak bude nove jmeno
                        if namecounter[player['name']] > 1:
                            playerobj, created = Player.objects.get_or_create(nickname=player['name']+"-"+player['team'])


                    if 'gender' in player:
                        playerobj.gender = player['gender']
                    playerobj.save()

                    #vytvoreni golu/asistenci hrace
                    for info in player:
                        if info not in ['name', 'team', 'gender']:
                            date = datetime.strptime(info, '%d.%m.%Y').date()
                            tournament = Tournament.objects.get(date=date)
                            match = Match.objects.get(tournament=tournament)

                            #pokud ma nejake staty
                            if player[info] and player[info] not in ['-', '?']:
                                shotscount = int(player[info])
                                for i in range(shotscount):
                                    newgoal = Goal(match=match)
                                    if shooters:
                                        newgoal.shooter = playerobj
                                    else:
                                        newgoal.assistance = playerobj
                                    newgoal.save()


                            #vytvoreni a prirazeni tymu ve kterych hrac byl v rocnicich kdy hral
                                teams = player['team'].split(',')
                                if len(teams) == 1 and shotscount > 0:
                                    teamname = player['team']
                                    teamobj, created = Team.objects.get_or_create(name=teamname)

                                    teamtourobj, created = TeamOnTournament.objects.get_or_create(
                                        team=teamobj, tournament=tournament)
                                    teamtourobj.players.add(playerobj)
                                    teamtourobj.save()


