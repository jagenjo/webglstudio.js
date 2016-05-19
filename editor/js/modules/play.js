var PlayModule = {
	name: "Play",
	bigicon: "imgs/tabicon-player.png",

	state: "stop",

	settings_panel: [{name:"play", title:"Play", icon:null }],

	max_delta_time: 1/15,
	inplayer: false,

	preferences: { //persistent settings
		tint_interface_when_playing: true,
		render_play_border: true,
		restore_state_after_play: true
	},

	init: function()
	{
		LiteGUI.addCSS("\
			#play-tools { position: fixed; top: 2px; right: 300px; font-size: 1.4em; padding-right: 3px; z-index: 10; } \
			#play-tools button { padding: 0 0.5em; } \
		");

		LEvent.bind( LS.GlobalScene, "clear", this.onSceneStop, this);
		RenderModule.canvas_manager.addWidget( PlayModule ); //capture render from square, and update and events

		//tools
		var container = document.createElement("div");
		container.id = "play-tools";
		container.className = "big-buttons";
		container.innerHTML = "<button id='play-button'>Play</button><button id='pause-button' disabled>Pause</button><button id='stopkeep-button' disabled>Keep</button><button id='launch-button'>Launch</button>";
		this.play_button = container.querySelector("#play-button");
		this.pause_button = container.querySelector("#pause-button");
		this.stopkeep_button = container.querySelector("#stopkeep-button");
		this.launch_button = container.querySelector("#launch-button");
		this.play_button.addEventListener("click", this.onPlay.bind(this) );
		this.pause_button.addEventListener("click", this.onPause.bind(this) );
		this.stopkeep_button.addEventListener("click", this.onStopKeep.bind(this) );
		this.launch_button.addEventListener("click", this.launch.bind(this) );

		setTimeout( function() { //timeout because some weird glitch
			document.getElementById("mainmenubar").appendChild( container );
		}, 1000);

		this.tab = LiteGUI.main_tabs.addTab("Player", {id:"ingametab", bigicon: this.bigicon, size: "full", module: EditorModule, callback: function() {
			//get the canvas
			var canvas = RenderModule.appendViewportTo( PlayModule.tab.content );
			RenderModule.render_settings.in_player = true;
			PlayModule.inplayer = true;

			//RenderModule.canvas_manager.addWidget(PlayModule); //capture render, update and mouse.

			//canvas.width = canvas.width - 20;
			//RenderModule.requestFrame();
			//EditorModule.refreshAttributes();
		},
		callback_leave: function() {
			//RenderModule.render_settings.in_player = false;
			//RenderModule.canvas_manager.removeWidget(PlayModule); //remove capture render, update and mouse
			PlayModule.inplayer = false;
			RenderModule.appendViewportTo(null);
		}});

		//overwrite method to add the module to the right place
		LS.getGUIElement = function()
		{
			if( LS._gui_element )
				return LS._gui_element;

			var gui = document.createElement("div");
			gui.className = "litescene-gui";
			gui.style.position = "absolute";
			gui.style.top = "0";
			gui.style.left = "0";
			PlayModule.tab.content.appendChild( gui );
			LS._gui_element = gui;
			return gui;
		},

		this.tab.content.style.overflow = "hidden";
	},

	//play clicked
	onPlay: function()
	{
		if(this.state == "stop") //play
		{
			//send ready signal
			var result = LEvent.trigger( LS.GlobalScene, "prepare_play" );
			if( result === false )
			{
				console.log("Play aborted");
				return;
			}

			//serialize before launching
			this._backup = LS.GlobalScene.serialize();
			var selected_node = SelectionModule.getSelectedNode();
			this._selected_node_uid = selected_node ? selected_node.uid : null;

			this.play_button.innerHTML = "Stop";
			this.pause_button.removeAttribute('disabled');
			this.stopkeep_button.removeAttribute('disabled');
			this.changeState("play");
		}
		else //stop
		{
			this.play_button.innerHTML = "Play";
			this.pause_button.setAttribute('disabled','disabled');
			this.stopkeep_button.setAttribute('disabled','disabled');
			this.changeState("stop");

			//restore old scene
			if(this.preferences.restore_state_after_play)
			{
				var scene = LS.GlobalScene;
				LEvent.trigger(scene,"beforeReload");
				scene.clear();
				scene.configure(this._backup);
				LEvent.trigger(scene,"reload");

				if(this._selected_node_uid)
				{
					var old_selected_node = scene.getNodeByUId( this._selected_node_uid );
					if(old_selected_node)
						SelectionModule.setSelection( old_selected_node );
				}
				EditorModule.refreshAttributes();
			}
		}
	},

	onPause: function() {
		this.state = this.state == 'pause' ? 'play' : 'pause';
	},

	onStopKeep: function() {
		if(this.state != "play")
			return;
		this.changeState("stop");
		this.play_button.innerHTML = "Play";
		this.pause_button.setAttribute('disabled','disabled');
	},

	launch: function()
	{
		DriveModule.checkResourcesSaved( true, inner_ready );

		function inner_ready()
		{
			//open window
			var demo_window = window.open("player.html", "", "width=800, height=600");
			demo_window.onload = launch;

			//pass current scene
			var scene_info = LS.GlobalScene.serialize();

			//play
			function launch()
			{
				demo_window.player.setScene( scene_info );
			};
		}
	},

	play: function()
	{
		this.changeState("play");
	},

	stop: function()
	{
		this.changeState("stop");
	},

	changeState: function(state)
	{
		if(state == this.state) 
			return;

		var scene = LS.GlobalScene;

		if(state == "play")
		{
			this.state = "play";
			console.log("%c + START ", 'background: #222; color: #AFA; font-size: 1.4em');
			if(this.preferences.tint_interface_when_playing)
				LiteGUI.root.classList.add("playing");
			LEvent.bind( scene,"finish", this.onSceneStop );
			scene.start();
			EditorModule.render_debug_info = false;
			EditorModule.refreshAttributes();
			RenderModule.requestFrame();
		}
		else if(state == "stop")
		{
			this.state = "stop";
			console.log("%c + FINISH ", 'background: #222; color: #AAF; font-size: 1.4em');
			LiteGUI.root.classList.remove("playing");
			scene.finish();
			LS.Tween.reset();
			EditorModule.render_debug_info = true;
			RenderModule.requestFrame();
			LEvent.unbind( scene,"finish", this.onSceneStop );
			LS.removeGUIElement();
		}
	},

	onSceneStop: function()
	{
		PlayModule.changeState("stop");
		PlayModule.play_button.innerHTML = "Play";
	},

	onevent: function(e)
	{
		if(!this.inplayer)
			return;

		LEvent.trigger( LS.GlobalScene, e.eventType, e );
		//LS.GlobalScene.triggerInNodes(e.eventType, e);

		//block propagation (mousemove should be propagated so when dragging panels works)
		if(e.type != "mousemove")
			e.stopPropagation();
		e.preventDefault();
		return true;
	},

	render: function()
	{
		if(!RenderModule.frame_updated || this.inplayer || LS.GlobalScene._state == LS.STOPPED || !this.preferences.render_play_border)
			return;

		//render inplayer border
		var ctx = gl;
		ctx.start2D();
		ctx.strokeColor = [0,1,1,0.8];
		ctx.strokeRect(1,1,gl.canvas.width-2,gl.canvas.height-2);
		ctx.finish2D();
	},

	update: function(dt)
	{
		if(dt > PlayModule.max_delta_time)
			dt = PlayModule.max_delta_time;
		if( this.state == 'play' )
		{
			LS.GlobalScene.update(dt);
			LS.Tween.update(dt);
		}
	},

	onShowSettingsPanel: function(name,widgets)
	{
 		if(name != "play")
			return;

		widgets.addCheckbox("Reset scene after play",PlayModule.preferences.restore_state_after_play, { callback: function(value) { 
			PlayModule.preferences.restore_state_after_play = value;
		}});

		widgets.addCheckbox("Show Play window border",PlayModule.preferences.render_play_border, { callback: function(value) { 
			PlayModule.preferences.render_play_border = value;
		}});

		widgets.addCheckbox("Tint Interface while playing",PlayModule.preferences.tint_interface_when_playing, { callback: function(value) { 
			PlayModule.preferences.tint_interface_when_playing = value;
		}});

	}
};

CORE.registerModule( PlayModule );