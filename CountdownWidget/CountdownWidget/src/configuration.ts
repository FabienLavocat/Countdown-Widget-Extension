// ---------------------------------------------------------------------
// <copyright file="configuration.ts">
//    This code is licensed under the MIT License.
//    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
//    ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
//    TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
//    PARTICULAR PURPOSE AND NONINFRINGEMENT.
// </copyright>
// <summary>
//    This is part of the Countdown widget
//    from the ALM Rangers. This file contains the
//    widget configuration code.
// </summary>
// ---------------------------------------------------------------------

// tslint:disable-next-line
/// <reference path="isettings.d.ts" />

import moment = require("moment-timezone");
import Q = require("q");
import spectrum = require("spectrum-colorpicker");
import TFS_Core_Contracts = require("TFS/Core/Contracts");
import Work_Contracts = require("TFS/Work/Contracts");
import Work_Client = require("TFS/Work/RestClient");
import Controls = require("VSS/Controls");
import Combos = require("VSS/Controls/Combos");
import Service = require("VSS/Service");
import WebApi_Constants = require("VSS/WebApi/Constants");

// import TelemetryClient = require("scripts/TelemetryClient");

export class Configuration {
	private static $dateTimeCombo: Combos.Combo = null;

	private widgetConfigurationContext = null;
	private $countdownDateInput = $("#countdown-date-input");
	private $datetimepicker = $("#datetimepicker") as any;
	private $select = $("select");
	private $backgroundColor = $("#background-color-input");
	private $foregroundColor = $("#foreground-color-input");
	private $skipNonWorkingDays = $("#skipNonWorkingDays");
	private $roundNumber = $("#roundNumber");
	private currentIterationEnd = null;
	constructor(public WidgetHelpers, public isSprintWidget: boolean) { }

	public load(widgetSettings, widgetConfigurationContext) {
		this.widgetConfigurationContext = widgetConfigurationContext;

		this.getCurrentIteration()
			.then((currentIterationEnd) => {
				this.currentIterationEnd = currentIterationEnd;
				const settings: ISettings = JSON.parse(widgetSettings.customSettings.data);

				this.showTimezones(settings);
				this.showColorPickers(settings);
				this.showDateTimePicker(settings, currentIterationEnd);
				this.showWorkingDays(settings);
				this.showRoundNumber(settings);

				VSS.resize();
				this.$select
					.add(this.$backgroundColor)
					.add(this.$foregroundColor)
					.add(this.$skipNonWorkingDays)
					.add(this.$roundNumber)
					.change(() => {
						this.widgetConfigurationContext.notify(this.WidgetHelpers.WidgetEvent.ConfigurationChange,
							this.WidgetHelpers.WidgetEvent.Args(this.getCustomSettings()));
					});
			});

		return this.WidgetHelpers.WidgetStatusHelper.Success();
	}

	public onSave() {
		const isValid = true;
		if (isValid) {
			// TelemetryClient.TelemetryClient.getClient().trackEvent("Updated configuration");
			return this.WidgetHelpers.WidgetConfigurationSave.Valid(this.getCustomSettings());
		} else {
			return this.WidgetHelpers.WidgetConfigurationSave.Invalid();
		}

	}

	private showDateTimePicker(settings, currentIterationEnd) {
		if (!this.isSprintWidget) {
			let countDownDate = moment();
			if (settings && settings.countDownDate) {
				countDownDate = moment(settings.countDownDate, "MM-DD-YYYY HH:mm");
			} else {
				countDownDate = moment().add(1, "days");
			}

			const dateTimeOptions: Combos.IDateTimeComboOptions = {
				change: () => {
					this.widgetConfigurationContext.notify(this.WidgetHelpers.WidgetEvent.ConfigurationChange,
						this.WidgetHelpers.WidgetEvent.Args(this.getCustomSettings()));
				},
				dateTimeFormat: "F",
				type: "date-time",
				value: countDownDate.format("LLLL"),
			};
			Configuration.$dateTimeCombo = Controls.create(Combos.Combo, this.$datetimepicker, dateTimeOptions);
		} else {
			this.$datetimepicker.hide();
			$(".countdown-config-label").hide();
		}
	}

	private showColorPickers(settings) {
		const palette = [
			["black", "white", "tan", "turquoise", "pink"],
			["red", "yellow", "green", "blue", "violet"],
		];

		const colorSettings = {
			color: "",
			hideAfterPaletteSelect: true,
			palette,
			showPalette: true,
			showPaletteOnly: true,
		};

		colorSettings.color = (settings && settings.backgroundColor) ?
			settings.backgroundColor
			: "green";

		(this.$backgroundColor as any).spectrum(colorSettings);

		colorSettings.color = (settings && settings.foregroundColor) ?
			settings.foregroundColor
			: "white";
		(this.$foregroundColor as any).spectrum(colorSettings);

	}

	private showTimezones(settings) {
		if (!this.isSprintWidget) {
			const timezones = moment.tz.names();
			for (const timezone of timezones) {
				const opt = document.createElement("option");
				opt.innerHTML = timezone;
				opt.value = timezone;
				this.$select[0].appendChild(opt);
			}

			if (settings && settings.timezone) {
				this.$select.val(settings.timezone);
			} else {
				this.$select.val((moment as any).tz.guess());
			}
		} else {
			this.$select.hide();
			$(".countdown-config-label").hide();
		}
	}

	private showWorkingDays(settings) {
		if (settings) {
			this.$skipNonWorkingDays.prop("checked", settings.skipNonWorkingDays);
		} else {
			this.$skipNonWorkingDays.prop("checked", false);
		}
	}

	private showRoundNumber(settings) {
		if (settings) {
			this.$roundNumber.prop("checked", settings.roundNumber);
		} else {
			this.$roundNumber.prop("checked", false);
		}
	}

	private getCustomSettings() {
		let formattedDate = "";
		if (this.isSprintWidget) {
			if (this.currentIterationEnd) {
				formattedDate = moment(this.currentIterationEnd).format("MM-DD-YYYY HH:mm");
			}
		} else {
			const selectedDate = Configuration.$dateTimeCombo.getValue();
			if (selectedDate) {
				formattedDate = moment(selectedDate).format("MM-DD-YYYY HH:mm");
			}
		}

		const foregroundColor = (this.$foregroundColor as any).spectrum("get").toRgbString();
		const backgroundColor = (this.$backgroundColor as any).spectrum("get").toRgbString();
		const skipNonWorkingDays = this.$skipNonWorkingDays.prop("checked");
		const roundNumber = this.$roundNumber.prop("checked");

		const result = {
			data: JSON.stringify({
				backgroundColor,
				countDownDate: formattedDate,
				foregroundColor,
				roundNumber,
				skipNonWorkingDays,
				timezone: $("select").val(),
			} as ISettings),
		};
		return result;
	}

	private getCurrentIteration(): IPromise<Date> {
		const deferred = Q.defer<Date>();
		const webContext = VSS.getWebContext();
		const teamContext: TFS_Core_Contracts.TeamContext = {
			project: "",
			projectId: webContext.project.id,
			team: "",
			teamId: webContext.team.id,
		};

		const workClient: Work_Client.WorkHttpClient = Service.VssConnection
			.getConnection()
			.getHttpClient(Work_Client.WorkHttpClient, WebApi_Constants.ServiceInstanceTypes.TFS);

		workClient.getTeamIterations(teamContext).then((iterations) => {
			if (iterations.length > 0) {
				workClient.getTeamIterations(teamContext, "current").then((teamIterations) => {
					if (teamIterations.length > 0) {
						deferred.resolve(teamIterations[0].attributes.finishDate);
					} else {
						deferred.resolve(null);
					}
				});
			} else {
				deferred.resolve(null);
			}
		});

		return deferred.promise;
	}
}

VSS.require(["TFS/Dashboards/WidgetHelpers"], (WidgetHelpers) => {
	VSS.register("SprintEndCountdownWidget-Configuration", () => {
		const configuration = new Configuration(WidgetHelpers, true);
		return configuration;
	});

	VSS.notifyLoadSucceeded();
});

VSS.require(["TFS/Dashboards/WidgetHelpers"], (WidgetHelpers) => {
	VSS.register("CountdownWidget-Configuration", () => {
		const configuration = new Configuration(WidgetHelpers, false);
		return configuration;
	});

	VSS.notifyLoadSucceeded();
});
