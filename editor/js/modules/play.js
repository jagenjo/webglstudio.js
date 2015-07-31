var PlayModule = {
	name: "Play",
	bigicon: "imgs/tabicon-player.png",

	state: "stop",

	settings_panel: [{name:"play", title:"Play", icon:null }],

	restore_state: true,
	max_delta_time: 1/15,
	inplayer: false,

	init: function()
	{
		LiteGUI.addCSS("\
			#play-tools { position: fixed; top: 2px; right: 300px; font-size: 1.4em; padding-right: 3px; z-index: 10; } \
			#play-tools button { padding: 0 0.5em; } \
		");

		var container = document.createElement("div");
		container.id = "play-tools";
		container.className = "big-buttons";

		LEvent.bind( LS.GlobalScene, "clear", this.onSceneStop, this);

		container.innerHTML = "<button id='play-button'>Play</button><button id='pause-button' disabled>Pause</button><button id='stopkeep-button'>Keep</button><button id='launch-button'>Launch</button>";
		this.play_button = container.querySelector("#play-button");
		this.pause_button = container.querySelector("#pause-button");
		this.stopkeep_button = container.querySelector("#stopkeep-button");
		this.launch_button = container.querySelector("#launch-button");
		this.play_button.addEventListener("click", this.onPlay.bind(this) );
		this.pause_button.addEventListener("click", this.onPause.bind(this) );
		this.stopkeep_button.addEventListener("click", this.onStopKeep.bind(this) );
		this.launch_button.addEventListener("click", this.onLaunch.bind(this) );

		RenderModule.viewport3d.addModule( PlayModule ); //capture render, update and mouse.

		setTimeout( function() { //timeout because some weird glitch
			document.getElementById("mainmenubar").appendChild( container );
		}, 200);

		this.tab = LiteGUI.main_tabs.addTab("Player", {id:"ingametab", bigicon: this.bigicon, size: "full", module: EditorModule, callback: function() {
			//get the canvas
			var canvas = RenderModule.appendViewportTo( PlayModule.tab.content );

			RenderModule.render_options.in_player = true;
			PlayModule.inplayer = true;

			//RenderModule.viewport3d.addModule(PlayModule); //capture render, update and mouse.

			//canvas.width = canvas.width - 20;
			//RenderModule.requestFrame();
			//EditorModule.refreshAttributes();
		},
		callback_leave: function() {
			RenderModule.render_options.in_player = false;
			//RenderModule.viewport3d.removeModule(PlayModule); //remove capture render, update and mouse
			PlayModule.inplayer = false;
			RenderModule.appendViewportTo(null);
		}});

		this.tab.content.style.overflow = "hidden";
	},

	onPlay: function()
	{
		if(this.state == "stop") //play
		{
			this._backup = Scene.serialize(); //serialize before launching
			this.changeState("play");
			this.play_button.innerHTML = "Stop";
			$(this.pause_button).removeAttr('disabled');
		}
		else //stop
		{
			this.changeState("stop");
			this.play_button.innerHTML = "Play";
			$(this.pause_button).attr('disabled','disabled');

			var selected_node = SelectionModule.getSelectedNode();

			//restore old scene
			if(this.restore_state)
			{
				var selected_node_id = selected_node ? selected_node.id : null;
				var scene = LS.GlobalScene;
				LEvent.trigger(scene,"beforeReload");
				scene.clear();
				scene.configure(this._backup);
				LEvent.trigger(scene,"reload");
				SelectionModule.setSelection( scene.getNode( selected_node_id ) );
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
		$(this.pause_button).attr('disabled','disabled');
	},

	onLaunch: function()
	{
		//open window
		var demo_window = window.open("player.html", "", "width=800, height=600");
		demo_window.onload = launch;

		//pass current scene
		var scene_info = LS.GlobalScene.serialize();

		//play
		function launch()
		{
			demo_window.init({ resources: ResourcesManager.path, shaders: RenderModule.shaders_url, redraw: true, autoresize: true });
			demo_window.context.setScene( scene_info );
		};
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
			console.log("Starting...");
			LEvent.bind( scene,"stop", this.onSceneStop );
			scene.start();
			EditorModule.render_debug_info = false;
			EditorModule.refreshAttributes();
			RenderModule.requestFrame();
		}
		else if(state == "stop")
		{
			this.state = "stop";
			console.log("Stopped...");

			scene.stop();
			EditorModule.render_debug_info = true;
			RenderModule.requestFrame();
			LEvent.unbind( scene,"stop", this.onSceneStop );
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
		
		LS.GlobalScene.triggerInNodes(e.eventType, e);

		//block propagation
		e.preventDefault();
		e.stopPropagation();
		return true;
	},

	update: function(dt)
	{
		if(dt > PlayModule.max_delta_time)
			dt = PlayModule.max_delta_time;
		if( this.state == 'play' )
			LS.GlobalScene.update(dt);
	},

	onShowSettingsPanel: function(name,widgets)
	{
 		if(name != "play") return;

		widgets.addCheckbox("Reset Scene",PlayModule.restore_state, { callback: function(value) { 
			PlayModule.restore_state = value;
		}});
	},
};

LiteGUI.registerModule( PlayModule );