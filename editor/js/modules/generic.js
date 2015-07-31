var genericFX = {
	name: "genericFX",

	init: function()
	{
		var menubar = LiteGUI.menubar;
		menubar.add("Actions/Tools/daylight", { callback: function() { genericFX.showDayLightDialog(); }});
		menubar.add("Actions/Tools/autorotate cam", { callback: function() { genericFX.autoRotateCamera(); }});
		menubar.add("Actions/Tools/autorotate node", { callback: function() { genericFX.autoRotateNode(); }});
		menubar.add("Window/visormode", { callback: function() { genericFX.enableVisorMode(); }});
	},

	enableVisorMode: function()
	{
		var offset = $("#visor").offset();
		var height = $("#visor").height();
		var wrap_height = $("#wrap").height();
		var work_height = $("#work-area").height();

		$(".ineditor").hide();
		LiteGUI.sidepanel.hide();
		$("#wrap").css( "margin-top", offset.top );
		$("#wrap").css( "height", height );
		$("#main-area").css( "height", "100%" );
		$("#work-area").css( "height", "100%" );
		$(document.body).css( "height", "calc(100% - "+offset.top+"px)");
		$(document.body).css( "height", "-webkit-calc(100% - "+offset.top+"px)");

		$(LiteGUI).bind("escape",inner);

		function inner()
		{
			$(".ineditor").show();						
			$("#wrap").css( "margin-top", 0 );
			$("#wrap").css( "height", wrap_height );
			$("#main-area").css( "height", "calc(100% - 40px)" );
			$("#main-area").css( "height", "-webkit-calc(100% - 40px)" );
			$("#work-area").css( "height", "calc(100% - 44px)" );
			$("#work-area").css( "height", "-webkit-calc(100% - 44px)" );
			$(document.body).css( "height", "100%");
			$(LiteGUI).unbind("escape",inner);
		}
	},

	showDayLightDialog: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_daylight", {title:"Day light editor", close: true, minimize: true, width: 300, height: 120, scroll: false, draggable: true});
		dialog.show('fade');

		var sun_height = Scene.extra.sun_height || 1;
		var sun_orientation = Scene.extra.sun_orientation || 0;
		var sun_distance = Scene.extra.sun_distance || vec3.dist(Scene.light.position, Scene.light.target);
		var change_color = false;

		var widgets = new LiteGUI.Inspector();
		widgets.addSlider("Sun Height", sun_height, { min:0, max:1, step:0.001, callback: function(v) { sun_height = v; inner_update(); }});
		widgets.addSlider("Sun Orientation", sun_orientation, { min:0, max:360, step:1, callback: function(v) { sun_orientation = v; inner_update(); }});
		widgets.addSlider("Sun Distance", sun_distance, { min:0, max:1000, step:1, callback: function(v) { sun_distance = v; inner_update(); }});
		widgets.addCheckbox("Change color", change_color, { callback: function(v) { change_color = v; inner_update(); }});
		dialog.content.appendChild(widgets.root);

		var gradient_sun = [[0,0,0],[0.4,0.512,0.2],[1,0.68,0.2],[1,0.93,0.7],[1,1,1],[1,1,1]];
		var gradient_sky = [[0,0,0],[0.1752,0.22272,0.24], [0.7,0.4,0.02],[0.55,0.74,0.94],[0.75,0.91,0.97],[0.75,0.91,0.97]];

		inner_update();

		function inner_update()
		{
			Scene.light.type = Light.DIRECTIONAL;
			Scene.light.size = 140;

			//color
			if(change_color)
			{
				var c = null;
				var c1 = Math.floor(sun_height * (gradient_sun.length-1));
				var c2 = Math.ceil(sun_height * (gradient_sun.length-1));
				var f = sun_height * (gradient_sun.length-1) % 1;

				vec3.lerp( gradient_sun[c1], gradient_sun[c2],f, Scene.light.color);
				vec3.lerp( gradient_sky[c1], gradient_sky[c2],f, Scene.background_color );
				vec3.lerp( gradient_sky[c1], gradient_sky[c2],f, Scene.ambient_color );
				vec3.scale( Scene.ambient_color, 0.8 );
			}

			//position
			var rot_pitch = quat4.fromAngleAxis((1-sun_height) * Math.PI * 0.5, [1,0,0], quat4.create() );
			quat4.multiplyVec3(rot_pitch, [0,sun_distance,0], Scene.light.position);

			var rot_yaw = quat4.fromAngleAxis(sun_orientation * 0.0174532925, [0,1,0], quat4.create() );
			quat4.multiplyVec3(rot_yaw, Scene.light.position);
			vec3.add(Scene.light.position, Scene.light.target);

			Scene.extra.sun_height = sun_height;
			Scene.extra.sun_orientation = sun_orientation;
			Scene.extra.sun_distance = sun_distance;

			RenderModule.requestFrame();
		}
	},

	autoRotateCamera: function()
	{
		if( !this.autorotating_cam )
		{
			LEvent.bind(Scene, "update", inner );
			this.autorotating_cam = true;
		}
		else
		{
			LEvent.unbind(Scene, "update", inner );
			this.autorotating_cam = false;
		}

		function inner(e, dt)
		{
			cameraTool.cam_orbit[0] += dt * 10;
			RenderModule.requestFrame();
		}
	},


	autoRotateNode: function()
	{
		if(!Scene.selected_node) return;

		if( !this.autorotating_node )
		{
			LEvent.bind(Scene, "update", inner );
			this.autorotating_node = true;
			this.rotating_node = Scene.selected_node;
		}
		else
		{
			LEvent.unbind(Scene, "update", inner );
			this.autorotating_node = false;
			this.rotating_node = null;
		}

		function inner(e, dt)
		{
			genericFX.rotating_node.transform.rotate(dt * 10,[0,1,0]);
			RenderModule.requestFrame();
		}
	}
};

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
		var docked = new LiteGUI.Panel("scripter_panel", {title:'docked panel', width: 400, hide:true});
		docked.dockTo("#workarea","left");
		docked.show();

		docked.content.innerHTML = "<div class='tools'><button class='execute'>Execute</button> <button class='auto-compile'>Auto-compile</button> | Scene <button class='reset'>Restore</button> <button class='update'>Save</button><button class='example' style='float: right'>Example</button></div><textarea class='code' style='height:calc(100% - 40px); height:-webkit-calc(100% - 40px);'></textarea>";
		var textarea = $(docked.content).find("textarea");
		var old_code = localStorage.getItem("wglstudio-scripter-code");
		if(!old_code)
			old_code = "if($1) $1.transform.rotateLocal(0.5,[0,1,0]);";
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

		$(docked.content).find("button.update").click(function() {
			backup = Scene.serialize();
		});

		$(docked.content).find("button.reset").click(function() {
			var id = null;
			if(Scene.selected_node)
				id = Scene.selected_node.id;
			Scene.clear();
			Scene.configure( backup );
			if(id != null)
				Scene.selected_node = Scene.getNode(id);
			RenderModule.requestFrame();
		});

		$(docked.content).find("button.execute").click(function() {
			EditorModule.saveSceneUndo();
			simpleScripter.compileCode();
		});

		$(docked.content).find("button.auto-compile").click(function() {
			if( $(this).hasClass("enabled") )
			{
				$(this).removeClass("enabled");
				clearInterval( simpleScripter._autocompile_timer  );
				simpleScripter._autocompile_timer = null;
			}
			else
			{
				$(this).addClass("enabled");
				EditorModule.saveSceneUndo();
				simpleScripter._autocompile_timer = setInterval(function() {
					simpleScripter.compileCode();
					if(Scene.nodes.length > 200)
						$("button.auto-compile").click(); //fail safe
				}, 1000/60);
			}
		});

		$(docked.content).find("button.example").click(function() {
			var example = "var node = $1; //$1 contains the selected node\nif(!node) return alert('select a node');\nfor(var i = 0; i < 50; i++)\n{\n	var newnode = node.clone();\n	newnode.transform.translate( [ Math.random() * 500, 0, Math.random()*-500]);\n	Scene.root.addChild(newnode);\n}\n";
			textarea.val(example);
		});
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