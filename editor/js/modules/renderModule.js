/*  
	This module is in charge or rendering the Scene.
	The module initializes the GraphicsViewport that handles the Web3D canvas and the interaction.
*/

var RenderModule = {
	name: "Scene",
	bigicon: "imgs/tabicon-scene.png",
	enabled: true,
	//settings_panel: [{name:"renderer", title:"Renderer", icon:null }],

	auto_render: false, //force render a frame every time
	frame_updated: false,
	render_mode: "full",
	shaders_url: "../litescene/data/shaders.xml",

	render_options: new RenderOptions(),
	cameras: [],
	selected_camera: null, //last viewport clicked by the mouse
	under_camera: null, //camera below the mouse

	commands:{},

	preview_camera: null,
	temp_camera: null, //used to clone preview camera

	init: function()
	{
		/*
		if(!gl)
		{
			LiteGUI.alert("WebGL support not found.<br/>Consider updating your browser or switching to Chrome or Firefox.");
			return;
		}
		*/

		//grab content
		/*
		var content = document.getElementById("visor");
		if(!content)
			throw("Visor area not found");
		*/

		//create 3D tab
		this.tab = LiteGUI.main_tabs.addTab( this.name, {
				id:"visortab", 
				bigicon: this.bigicon,
				size: "full",
				//content: "<div id='visorarea'></div>",
				module: EditorModule,
				callback: function() {
					if(!RenderModule.viewport3d)
						return;

					InterfaceModule.setSidePanelVisibility(true);
					RenderModule.viewport3d.resize(); //adapt to parent size
					RenderModule.requestFrame();
					EditorModule.refreshAttributes();
				}
		});

		//create split
		var visorarea = this.visorarea = new LiteGUI.Area("visorarea",{ height: "100%", autoresize: true, inmediateResize: true});
		visorarea.split("vertical",[null,300], true);
		visorarea.getSection(0).content.innerHTML = "<div id='visor'></div>";
		this.tab.add( visorarea );
		//visorarea.hideSection(1); //DEFAULT SHOW TIMELINE ***********************************
		var visor_container = document.getElementById("visor");
		InterfaceModule.setVisorArea( visorarea );

		//create 3D canvas and store inside the #visor
		this.viewport3d = new GraphicsViewport( visor_container, {full: true, antialiasing:true} );
		this.viewport3d.addModule(this); //capture render, update and mouse

		//CANVAS
		var canvas = this.viewport3d.canvas;
		this.shaders_url = LiteGUI.config.shaders || this.shaders_url;
		LS.ShadersManager.init( this.shaders_url ); //load shaders
		LS.Renderer.init();
		LS.catch_errors = false; //helps coding

		this.render_options.render_all_cameras = false;
		this.render_options.in_player = false;

		$(window).resize( function() {  RenderModule.requestFrame(); });

		$(LiteGUI).bind("resized",function(){
			canvas.width = $(canvas.parentNode).width();
			canvas.height = $(canvas.parentNode).height();
			RenderModule.requestFrame();
		});

		document.addEventListener("fullscreenchange", this.onChangeFullscreen );
		document.addEventListener("mozfullscreenchange", this.onChangeFullscreen );
		document.addEventListener("webkitfullscreenchange", this.onChangeFullscreen );

		LEvent.bind( LS.GlobalScene, "serialize", this.onSerialize.bind(this) );
		LEvent.bind( LS.GlobalScene, "configure", this.onConfigure.bind(this) );


		//init GUI *************************************

		this.setViewportLayout(1);

		//LS.GlobalScene.init();
		LEvent.bind( LS.GlobalScene, "change", function() { Scene.refresh(); }); //refresh image when something changes
		//this.viewport3d.addModule(this); 

		//DEPRECATED: Move to Widget or Helper
		LEvent.bind( LS.ResourcesManager, "resource_not_found", function(e,data) { RenderModule.assetNotFound(data) ; });
		LEvent.bind( LS.ResourcesManager, "start_loading_resources", function(e ) { 
			$("#loading_asset_icon").show();
		});
		LEvent.bind( LS.ResourcesManager, "end_loading_resources", function(e, status ) { 
			$("#loading_asset_icon").hide();
			if(status)
				RenderModule.requestFrame();
		});


		LEvent.bind( LS.ResourcesManager, "resource_loaded", function(e ) { 
			RenderModule.requestFrame();
		});

		//cameraTool.init();
		//this.viewport3d.modules.push(cameraTool);
		//ToolsModule.enableTool("orbit_camera");

		//init GUI
		LiteGUI.menubar.add("View/Autorender", { type: "checkbox", instance:RenderModule, property:"auto_render" });
		if(window.cameraTool)
			LiteGUI.menubar.add("View/Smooth Camera", { type: "checkbox", instance:cameraTool, property:"smooth_camera" });
		LiteGUI.menubar.add("View/Fullscreen", { callback: function() { RenderModule.goFullscreen(); }});
		LiteGUI.menubar.separator("View");
		LiteGUI.menubar.add("View/Orthographic", { callback: function() { RenderModule.changeCameraType( LS.Camera.ORTHOGRAPHIC ); }});
		LiteGUI.menubar.add("View/Perspective", { callback: function() { RenderModule.changeCameraType( LS.Camera.PERSPECTIVE ); }});
		LiteGUI.menubar.add("View/Camera properties", { callback: function() { EditorModule.inspectObjects( RenderModule.cameras ); }});

		LiteGUI.menubar.add("View/Layout/One", { callback: function(){ RenderModule.setViewportLayout(1); } });
		LiteGUI.menubar.add("View/Layout/Two", { callback: function(){ RenderModule.setViewportLayout(2); } });
		LiteGUI.menubar.add("View/Layout/Three", { callback: function(){ RenderModule.setViewportLayout(3); } });
		LiteGUI.menubar.add("View/Layout/Four", { callback: function(){ RenderModule.setViewportLayout(4); } });

		LiteGUI.menubar.separator("View");
		LiteGUI.menubar.add("Actions/System/Relaunch", { callback: RenderModule.relaunch });

		this.registerCommands();

		RenderModule.viewport3d.resize();
		this.temp_camera = new LS.Camera();
	},

	setViewportLayout: function(mode)
	{
		var old_cameras = this.cameras;
		this.cameras = [];

		if(mode == 2)
		{
			this.camera = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0,0,0.5,1]});
			this.camera2 = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0.5,0,0.5,1]});
			this.cameras.push( this.camera, this.camera2 );
		}
		else if(mode == 3)
		{
			this.camera = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0,0,0.5,0.5]});
			this.camera2 = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0,0.5,0.5,0.5]});
			this.camera3 = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0.5,0,0.5,1]});
			this.cameras.push( this.camera, this.camera2, this.camera3 );
		}
		else if(mode == 4)
		{
			this.camera = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0,0,0.5,0.5]});
			this.camera2 = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0.5,0,0.5,0.5]});
			this.camera3 = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0,0.5,0.5,0.5]});
			this.camera4 = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0.5,0.5,0.5,0.5]});
			this.cameras.push( this.camera, this.camera2, this.camera3 , this.camera4 );
		}
		else if(mode == 16)
		{
			for(var i = 0; i < 4; i++)
				for(var j = 0; j < 4; j++)
					this.cameras.push( this.camera = new LS.Camera({eye:[50 * Math.random(),100,100 * Math.random()],near:0.1,far:10000, viewport:[0.25*i,0.25*j,0.25,0.25]}) );
		}
		else //1
		{
			this.camera = new LS.Camera({eye:[50,100,100],near:0.1,far:10000, viewport:[0,0,1,1]});
			this.cameras.push( this.camera );
		}

		//add to the cameras useful editor info
		for(var i in this.cameras)
		{
			var camera = this.cameras[i];
			if(camera.editor)
				continue;
			camera.uid = LS.generateUId("CAM");
			camera.editor = { 
				name: "perspective",
				corner: "bottom-right",
				destination_eye: vec3.clone( camera.eye ),
				destination_center: vec3.clone( camera.center ),
				render_options: null,
				flags: {},
			}

			//add gizmos
			camera.gizmos = [ new CameraGizmo( camera ) ];
		}

		this.selected_camera = this.cameras[0];

		this.requestFrame();
	},
	
	relaunch: function() { 
		console.log("Relaunching...");
		RenderModule.viewport3d.gl.relaunch(); 
	},

	appendViewportTo: function(parent)
	{
		var canvas = this.viewport3d.canvas;
		if(parent)
			parent.appendChild(canvas);
		else
			document.getElementById("visor").appendChild(canvas);
		RenderModule.viewport3d.resize();
		RenderModule.requestFrame();
		return canvas;
	},

	getCanvas: function()
	{
		return this.viewport3d.canvas;
	},

	//called by the GraphicsViewport on requestAnimationFrame
	render: function(force_render)
	{
		this.frame_updated = false;

		if(!force_render)
		{
			//if 3d not visible
			if(!this.enabled) 
				return;
			if( !this.auto_render && !LS.GlobalScene._must_redraw )
				return;
		}

		this.frame_updated = true;

		//check if render one single camera or multiple cameras
		var cameras = null;
		if(!this.render_options.in_player)
		{
			cameras = this.cameras.concat(); //clone
			//search for render to texture cameras, puts them at the beginning
			var scene_cams = LS.GlobalScene._cameras;
			for(var i in scene_cams)
			{
				var cam = scene_cams[i];
				if(cam.isRenderedToTexture())
					cameras.unshift(cam);
			}

			if(this.preview_camera)
			{
				this.temp_camera.configure( this.preview_camera.serialize() );
				this.temp_camera.setViewportInPixels( gl.canvas.width - 220, 10, 200,200 );
				this.temp_camera.render_to_texture = false;
				this.temp_camera.eye = this.preview_camera.getEye();
				this.temp_camera.center = this.preview_camera.getCenter();
				cameras.push( this.temp_camera );
			}
			this.render_options.main_camera = this.selected_camera;
		}

		LEvent.trigger(this,"pre_scene_render");
		gl.clear( gl.DEPTH_BUFFER_BIT ); //¿?
		LS.Renderer.render( LS.GlobalScene, this.render_options, cameras );
		LEvent.trigger(this,"post_scene_render");
	},

	//used to select viewport
	mousedown: function(e)
	{
		var camera = this.getCameraUnderMouse(e);
		if(!camera || camera == this.selected_camera )
			return;
		this.selected_camera = camera;
	},

	//used to change the camera below the mouse
	mousemove: function(e)
	{
		var camera = this.getCameraUnderMouse(e);
		if(!camera || camera == this.under_camera )
			return;
		this.under_camera = camera;
	},

	getCameraUnderMouse: function(e)
	{
		var cameras = this.cameras;
		var viewport = vec4.create();
		for(var i = cameras.length-1; i >= 0; --i)
		{
			var camera = cameras[i];
			if( camera.isPointInCamera( e.canvasx, e.canvasy ) )
				return camera;
		}
		return null;
	},

	/*
	//called by the GraphicsViewport
	update: function(seconds) {
		//Scene.update(seconds);
		//this.updateCamera(seconds);
	},
	*/

	setRenderMode: function(v)
	{
		this.render_mode = v;

		this.render_options.force_shader = null;
		this.render_options.force_wireframe = false;
		this.render_options.shadows_disabled = false;
		this.render_options.lights_disabled = false;

		if(v == "wireframe")
		{
			this.render_options.force_shader = "flat";
			this.render_options.force_wireframe = true;
			this.render_options.shadows_disabled = true;
			this.render_options.lights_disabled = true;
		}
		else if(v == "flat")
		{
			this.render_options.force_shader = "flat";
			this.render_options.shadows_disabled = true;
			this.render_options.lights_disabled = true;
		}
		else if(v == "solid")
		{
			this.render_options.force_shader = "phong";
			this.render_options.shadows_disabled = true;
		}
		else if(v == "texture")
		{
			this.render_options.force_shader = "flat_texture";
			this.render_options.shadows_disabled = true;
			this.render_options.lights_disabled = true;
		}

		this.requestFrame();
	},

	changeCameraType: function(type)
	{
		var camera = this.selected_camera || this.camera;
		camera.type = type;
		this.requestFrame();
	},

	assets_missing: [],
	assetNotFound: function(url)
	{
		//console.error("Asset not found: " + url);
		return;

		this.assets_missing.push(url);

		var str = "";
		for(var i in this.assets_missing)
			str += "<p class='item'><strong>" + this.assets_missing[i] + "</strong></p>";

		LiteGUI.showMessage("<p>Some assets were missing (not found on the server):</p>" + str + "<p>If they are local files, please drag them to the interface and try to load again.</p>",{width: 400, height: 200, title:"Warning", onClose:inner}); 

		function inner()
		{
			RenderModule.assets_missing = [];
		}
	},

	requestFrame: function()
	{
		LS.GlobalScene.refresh();
	},

	loadScene: function(url)
	{
		var scene = LS.GlobalScene;
		scene.clear();

		if(url.substr(0,7) != "http://")
			url = 'data/scenes/' + url;
		scene.loadScene(url, inner_onload, inner_error );
		
		function inner_onload() {
			RenderModule.restoreSceneCamera();
		}

		function inner_error(name)
		{
			LiteGUI.alert("File not found: " + name);
		}
	},

	restoreSceneCamera: function()
	{
		if( LS.GlobalScene.extra.cam_orbit) 
			RenderModule.cam_orbit = Scene.extra.cam_orbit;
		else 
			RenderModule.cam_orbit = [0,15,200];

		if( LS.GlobalScene.extra.focus_point) 
			cameraTool.focus_point = Scene.extra.focus_point;
		else 
			cameraTool.focus_point = [0,0,0];
	},

	setAutoSelect: function(v)
	{
		cameraTool.auto_select = v;
	},

	setCameraMode: function(mode)
	{
		cameraTool.mode = mode;
	},

	onSerialize: function(e, o)
	{
		if(!o.extra)
			o.extra = {};

		var viewport_layout = o.extra.viewport_layout = {
			cameras: []	
		};

		//save cameras
		for(var i in this.cameras)
		{
			var camera = this.cameras[i];
			viewport_layout.cameras.push( camera.serialize() );
		}
	},

	onConfigure: function(e, o)
	{
		if(!o.extra || !o.extra.viewport_layout)
			return;

		//Restore cameras
		var viewport_layout = o.extra.viewport_layout;
		if(viewport_layout.cameras)
		{
			RenderModule.setViewportLayout( viewport_layout.cameras.length );
			for(var i in viewport_layout.cameras)
			{
				var cam_info = viewport_layout.cameras[i];
				RenderModule.cameras[i].configure(cam_info);
			}
		}
	},

	takeScreenshot: function(width, height)
	{
		width = width || 256;
		height = height || 256;

		var v3d = RenderModule.viewport3d;
		var old = [v3d.canvas.width,v3d.canvas.height];
		v3d.resize(width,height);
		
		this.render(true);
		var data = v3d.canvas.toDataURL("image/png");
		v3d.resize(old[0],old[1]);
		this.render(true); //force render a frame to clean 
		return data;
	},

	goFullscreen: function()
	{
		var fullscreen_root = document.getElementById("visor");
		//gl.fullscreen();

		if(fullscreen_root.requestFullScreen)
			fullscreen_root.requestFullScreen();
		else if(fullscreen_root.webkitRequestFullScreen)
			fullscreen_root.webkitRequestFullScreen();
		else if(fullscreen_root.mozRequestFullScreen)
			fullscreen_root.mozRequestFullScreen();
		else
			console.error("Fullscreen not supported");
	},

	onChangeFullscreen: function(e)
	{
		console.log(e);
		if(!RenderModule._old_size)
		{
			RenderModule._old_size = [gl.canvas.width, gl.canvas.height];
			gl.canvas.width = window.screen.width;
			gl.canvas.height = window.screen.height;
		}
		else
		{
			gl.canvas.width = RenderModule._old_size[0];
			gl.canvas.height = RenderModule._old_size[1];
			RenderModule._old_size = null;
		}
		LS.GlobalScene.refresh();
	},

	registerCommands: function()
	{
		this.commands["layout"] = function(cmd, tokens) { 
			EditorModule.inspectObjects( RenderModule.cameras );
		};
	}
};

LiteGUI.registerModule( RenderModule );




