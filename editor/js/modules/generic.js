var genericFX = {
	name: "genericFX",

	init: function()
	{
		var menubar = LiteGUI.menubar;
		menubar.add("Actions/Tools/day light", { callback: function() { genericFX.showDayLightDialog(); }});
	},

	showDayLightDialog: function()
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

LiteGUI.registerModule( genericFX );

//***********************************************

var simpleScripter = {
	name: "simpleScripter",

	init: function()
	{
		LiteGUI.menubar.add("Actions/Tools/scripter", { callback: function() { simpleScripter.showScripter(); }});
	},

	showScripter: function()
	{
		var dialog = new LiteGUI.Dialog("scripter_panel", {title:'docked panel', width: 400, height: 600, closable: true, resizable: true, draggable: true });

		dialog.content.style.width = "calc( 100% - 2px )";
		dialog.content.style.height = "calc( 100% - 50px )";
		dialog.content.innerHTML = "<div class='tools'><button class='execute'>Execute</button> <button class='auto-compile'>Auto-compile</button> | Scene <button class='reset'>Restore</button> <button class='update'>Save</button><button class='example' style='float: right'>Example</button></div><textarea class='code' style='height:calc(100% - 40px); height:-webkit-calc(100% - 40px);'></textarea>";
		var textarea = $(dialog.content).find("textarea");
		var old_code = localStorage.getItem("wglstudio-scripter-code");
		if(!old_code)
			old_code = "if($1)\n   $1.transform.rotateY(10);";
		textarea[0].style.width = "calc( 100% - 2px )";
		textarea[0].style.height = "calc( 100% - 2px )";
		textarea.val( old_code );
		this.textarea = textarea;

		var first_time = true;
		var backup = Scene.serialize();

		textarea.bind("keydown",function(e) {
			var keyCode = e.keyCode || e.which;

			if(keyCode == 9) //tab
			{
				e.preventDefault();
				var start = $(this).get(0).selectionStart;
				var end = $(this).get(0).selectionEnd;

				// set textarea value to: text before caret + tab + text after caret
				$(this).val($(this).val().substring(0, start)
							+ "\t"
							+ $(this).val().substring(end));

				// put caret at right position again
				$(this).get(0).selectionStart =
				$(this).get(0).selectionEnd = start + 1;
				return false;
			}
			else if (keyCode == 13 && e.ctrlKey)
			{
				$(docked.content).find("button.compile").click();
			}
		});

		$(dialog.content).find("button.update").click(function() {
			backup = Scene.serialize();
		});

		$(dialog.content).find("button.reset").click(function() {
			var id = null;
			if(Scene.selected_node)
				id = Scene.selected_node.id;
			Scene.clear();
			Scene.configure( backup );
			if(id != null)
				Scene.selected_node = Scene.getNode(id);
			RenderModule.requestFrame();
		});

		$(dialog.content).find("button.execute").click(function() {
			UndoModule.saveSceneUndo();
			simpleScripter.compileCode();
		});

		$(dialog.content).find("button.auto-compile").click(function() {
			if( $(this).hasClass("enabled") )
			{
				$(this).removeClass("enabled");
				clearInterval( simpleScripter._autocompile_timer  );
				simpleScripter._autocompile_timer = null;
			}
			else
			{
				$(this).addClass("enabled");
				UndoModule.saveSceneUndo();
				simpleScripter._autocompile_timer = setInterval(function() {
					simpleScripter.compileCode();
					if(Scene.nodes.length > 200)
						$("button.auto-compile").click(); //fail safe
				}, 1000/60);
			}
		});

		$(dialog.content).find("button.example").click(function() {
			var example = "var node = $1; //$1 contains the selected node\nif(!node) return LiteGUI.alert('select a node');\nfor(var i = 0; i < 50; i++)\n{\n	var newnode = node.clone();\n	newnode.transform.translate( [ Math.random() * 500, 0, Math.random()*-500]);\n	LS.GlobalScene.root.addChild(newnode);\n}\n";
			textarea.val(example);
		});

		dialog.show();
	},

	compileCode: function()
	{
		var code = this.textarea.val();
		localStorage.setItem("wglstudio-scripter-code",code);
		code =  "var $1 = Scene.selected_node;\n" + code;

		try
		{
			eval( "simpleScripter._compiled_func = function() {" + code + ";\n};");
			simpleScripter._compiled_func();
			RenderModule.requestFrame();
		}
		catch (err)
		{
			//trace(err);
			//LiteGUI.alert("Error: " + err);
			return;
		}

		//save the good ones
		if(this._compiled_func)
			this._last_valid_func = this._compiled_func;
	},
};

LiteGUI.registerModule( simpleScripter );