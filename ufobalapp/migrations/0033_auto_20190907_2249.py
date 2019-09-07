# -*- coding: utf-8 -*-
# Generated by Django 1.9.7 on 2019-09-07 20:49
from __future__ import unicode_literals

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('ufobalapp', '0032_auto_20170122_1015'),
    ]

    operations = [
        migrations.AddField(
            model_name='team',
            name='name_short',
            field=models.CharField(blank=True, max_length=20, null=True, verbose_name='Zkrácené jméno'),
        ),
        migrations.AddField(
            model_name='teamontournament',
            name='name_short',
            field=models.CharField(blank=True, max_length=20, null=True, verbose_name='Zkrácené jméno na turnaji'),
        ),
        migrations.AlterField(
            model_name='match',
            name='team_one',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='matches1', to='ufobalapp.TeamOnTournament', verbose_name='Tým 1'),
        ),
        migrations.AlterField(
            model_name='match',
            name='team_two',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='matches2', to='ufobalapp.TeamOnTournament', verbose_name='Tým 2'),
        ),
        migrations.AlterField(
            model_name='match',
            name='tournament',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='matches', to='ufobalapp.Tournament', verbose_name='Turnaj'),
        ),
    ]