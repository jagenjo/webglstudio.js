//this is a file that is not included in the config.json, the purpose is to test the 


var DayLightTool = {

	name: "daylight",

	init: function()
	{
		LiteGUI.menubar.add("Actions/Tools/day light", { callback: function() { DayLightTool.showDialog(); }});
	},

	deinit: function()
	{
		LiteGUI.menubar.remove("Actions/Tools/day light");
	},

	showDialog: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_daylight", {title:"Day light editor", close: true, width: 300, height: 120, scroll: false, draggable: true});
		dialog.show('fade');

		var scene = LS.GlobalScene;
		var light = scene.root.light;

		var sun_height = scene.extra.sun_height || 1;
		var sun_orientation = scene.extra.sun_orientation || 0;
		var sun_distance = scene.extra.sun_distance || vec3.dist( light.position, light.target);
		var change_color = false;

		var widgets = new LiteGUI.Inspector();
		widgets.addSlider("Sun Height", sun_height, { min:0, max:1, step:0.001, callback: function(v) { sun_height = v; inner_update(); }});
		widgets.addSlider("Sun Orientation", sun_orientation, { min:0, max:360, step:1, callback: function(v) { sun_orientation = v; inner_update(); }});
		widgets.addSlider("Sun Distance", sun_distance, { min:0, max:1000, step:1, callback: function(v) { sun_distance = v; inner_update(); }});
		widgets.addCheckbox("Change color", change_color, { callback: function(v) { change_color = v; inner_update(); }});
		dialog.add(widgets);

		var gradient_sun = [[0,0,0],[0.4,0.512,0.2],[1,0.68,0.2],[1,0.93,0.7],[1,1,1],[1,1,1]];
		var gradient_sky = [[0,0,0],[0.1752,0.22272,0.24], [0.7,0.4,0.02],[0.55,0.74,0.94],[0.75,0.91,0.97],[0.75,0.91,0.97]];

		inner_update();

		function inner_update()
		{
			light.type = Light.DIRECTIONAL;
			light.size = 140;

			//color
			if(change_color)
			{
				var c = null;
				var c1 = Math.floor(sun_height * (gradient_sun.length-1));
				var c2 = Math.ceil(sun_height * (gradient_sun.length-1));
				var f = sun_height * (gradient_sun.length-1) % 1;

				vec3.lerp( light.color, gradient_sun[c1], gradient_sun[c2],f );
				if(scene.info)
				{
					vec3.lerp( scene.info.background_color, gradient_sky[c1], gradient_sky[c2],f);
					vec3.lerp( scene.info.ambient_color, gradient_sky[c1], gradient_sky[c2],f );
					vec3.scale( scene.info.ambient_color, scene.info.ambient_color, 0.8 );
				}
			}

			//position
			var rot_pitch = quat.setAxisAngle( quat.create(), [1,0,0], (1-sun_height) * Math.PI * 0.5 );
			vec3.transformQuat( light.position, [0,sun_distance,0], rot_pitch);

			var rot_yaw = quat.setAxisAngle(quat.create(), [0,1,0], sun_orientation * 0.0174532925);
			vec3.transformQuat(light.position, light.position, rot_yaw);
			light.target.set([0,0,0]);

			scene.extra.sun_height = sun_height;
			scene.extra.sun_orientation = sun_orientation;
			scene.extra.sun_distance = sun_distance;

			RenderModule.requestFrame();
		}
	}
}

CORE.registerModule( DayLightTool );
//LiteGUI.trigger( CORE, "plugin_registered", DayLightTool );