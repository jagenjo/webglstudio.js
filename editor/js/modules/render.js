/*  
	This module is in charge or rendering the Scene.
	The module initializes the CanvasManager that handles the WebGL canvas and the interaction.
*/

var RenderModule = {

	name: "RenderModule",
	enabled: true,

	tab_name: "Scene",
	tab_bigicon: "imgs/tabicon-scene.png",

	auto_render: false, //force render a frame every time
	pause_render: false, //blocks any rendering
	frame_updated: false,
	render_mode: "full",
	shaders_url: "../litescene/data/shaders.xml",

	render_settings: null,
	viewports: [], //viewports from LayoutViewport (utils/LayoutViewport)
	cameras: [], //cameras
	selected_viewport: null, //last viewport clicked by the mouse
	active_viewport: null, //viewport below the mouse

	commands:{},

	preview_camera: null,
	view_safe_frame: false,
	temp_camera: null, //used to clone preview camera
	show_stencil_mask: -1,
	view_from_scene_cameras: false,
	
	//_render_callback: null, //used by some modules to overwrite the rendering momentary

	init: function()
	{
		this.render_settings = new LS.RenderSettings();

		//create 3D tab
		this.tab = LiteGUI.main_tabs.addTab( this.tab_name, {
				id:"visortab", 
				bigicon: this.tab_bigicon,
				size: "full",
				module: EditorModule,
				callback: function() {
					if(!RenderModule.canvas_manager)
						return;

					RenderModule.render_settings.in_player = false;
					InterfaceModule.setSidePanelVisibility(true);

					if(window.gl && window.gl.canvas)
					{
						RenderModule.canvas_manager.resize(); //adapt to parent size
						RenderModule.requestFrame();
					}
					EditorModule.refreshAttributes(); //why not? it was commented
				}
		});

		this.tab.content.style.overflow = "hidden";

		//create split
		var visorarea = this.visorarea = new LiteGUI.Area({ id: "visorarea", height: "100%", autoresize: true, inmediateResize: true});
		visorarea.split("vertical",[null,260], true);
		visorarea.getSection(0).content.innerHTML = "<div id='visor'><div id='maincanvas'></div><div id='statusbar'><span class='msg'></span></div></div>";
		visorarea.root.querySelector( "#statusbar" ).addEventListener("click", InterfaceModule.toggleStatusBar.bind( InterfaceModule ) );

		this.tab.add( visorarea );

		if( !InterfaceModule.preferences.show_low_panel )
			visorarea.hideSection(1); //DEFAULT SHOW TIMELINE ***********************************
		var visor_container = this.visor_container = document.getElementById("visor");
		var canvas_container = this.canvas_container = document.getElementById("maincanvas");
		InterfaceModule.setVisorArea( visorarea );

		//The WebGLContext is created from CanvasManager, not here
		//Create canvas and store inside the #visor
		this.canvas_manager = new CanvasManager( { container: canvas_container, full: true, antialiasing: true } );
		if(!this.canvas_manager.gl)
		{
			this.onWebGLNotEnabled();
			return;
		}

		//capture render so we can render the scene, get mouse events to switch active viewport, etc
		this.canvas_manager.addWidget( this, -10 );  //low priority, it renders first

		//Prepare the CANVAS and the LiteScene engine
		var canvas = this.canvas_manager.canvas;
		this.shaders_url = CORE.config.shaders || this.shaders_url;
		LS.Shaders.init( this.shaders_url ); //load shaders
		LS.Renderer.init();
		LS.Input.init();
		LS.catch_errors = false; //helps coding
		LS.GUI._allow_change_cursor = false;

		this.render_settings.render_all_cameras = false;
		this.render_settings.in_player = false;
		this.render_settings.keep_viewport = true;

		window.addEventListener("resize", function() { RenderModule.requestFrame(); }, true ); 

		LiteGUI.bind( LiteGUI, "resized", function(){
			canvas.width = canvas.parentNode.offsetHeight;
			canvas.height = canvas.parentNode.offsetWidth;
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
		LEvent.bind( LS.GlobalScene, "change", function() { LS.GlobalScene.refresh(); }); //refresh image when something changes

		LEvent.bind( LS.ResourcesManager, "resource_loaded", function(e ) { 
			RenderModule.requestFrame();
		});

		//init GUI
		LiteGUI.menubar.add("View/Autorender", { type: "checkbox", instance:RenderModule, property:"auto_render" });
		LiteGUI.menubar.add("View/Fullscreen", { callback: function() { RenderModule.goFullscreen(); }});
		LiteGUI.menubar.separator("View");
		LiteGUI.menubar.add("View/Camera/Orthographic", { callback: function() { RenderModule.changeCameraType( LS.Camera.ORTHOGRAPHIC ); }});
		LiteGUI.menubar.add("View/Camera/Perspective", { callback: function() { RenderModule.changeCameraType( LS.Camera.PERSPECTIVE ); }});
		LiteGUI.menubar.add("View/Camera/Properties", { callback: function() { EditorModule.inspect( RenderModule.cameras ); }});
		LiteGUI.menubar.add("View/Camera/Smooth", { type: "checkbox", instance: cameraTool, property:"smooth_camera" });
		LiteGUI.menubar.add("View/Camera/Lock Angle", { type: "checkbox", instance: cameraTool.settings, property:"lock_angle" });

		LiteGUI.menubar.add("View/Layout/One", { callback: function(){ RenderModule.setViewportLayout(1); } });
		LiteGUI.menubar.add("View/Layout/Two Vertical", { callback: function(){ RenderModule.setViewportLayout(2); } });
		LiteGUI.menubar.add("View/Layout/Two Horitzontal", { callback: function(){ RenderModule.setViewportLayout(3); } });
		LiteGUI.menubar.add("View/Layout/Three", { callback: function(){ RenderModule.setViewportLayout(4); } });
		LiteGUI.menubar.add("View/Layout/Four", { callback: function(){ RenderModule.setViewportLayout(5); } });
		LiteGUI.menubar.add("View/Layout/Four 2", { callback: function(){ RenderModule.setViewportLayout(6); } });

		LiteGUI.menubar.separator("View");
		//LiteGUI.menubar.add("Actions/System/Relaunch", { callback: RenderModule.relaunch });
		LiteGUI.menubar.add("View/Profiler", { type: "checkbox", instance: LS.Renderer, property:"render_profiler" });

		this.registerCommands();

		RenderModule.canvas_manager.resize();
		this.temp_camera = new LS.Camera();

		LEvent.bind( LS.Renderer, "afterRenderInstances", this.onAfterRenderInstances, this);
		LEvent.bind( LS.GlobalScene, "scene_loaded", this.onSceneLoaded, this );
	},

	setViewportLayout: function(mode)
	{
		var old_viewports = this.viewports.concat();

		//clear viewports
		this.viewports.length = 0;
		this.cameras.length = 0;
		this.viewports_mode = mode;

		//create new ones
		if(mode == 2)
		{
			this.viewports.push( new LayoutViewport({ viewport: [0,0,0.5,1] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0.5,0,0.5,1] }) );
		}
		else if(mode == 3)
		{
			this.viewports.push( new LayoutViewport({ viewport: [0,0.5,1,0.5] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0,0,1,0.5] }) );
		}
		else if(mode == 4)
		{
			this.viewports.push( new LayoutViewport({ viewport: [0,0.5,0.5,0.5] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0,0,0.5,0.5] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0.5,0,0.5,1] }) );
		}
		else if(mode == 5)
		{
			this.viewports.push( new LayoutViewport({ viewport: [0,0.5,0.5,0.5] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0.5,0.5,0.5,0.5] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0,0,0.5,0.5] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0.5,0,0.5,0.5] }) );
		}
		else if(mode == 6)
		{
			this.viewports.push( new LayoutViewport({ viewport: [0,0.25,0.25,0.75] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0.25,0.25,0.75,0.75] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0,0,0.25,0.25] }) );
			this.viewports.push( new LayoutViewport({ viewport: [0.25,0,0.75,0.25] }) );
		}
		else //1
		{
			this.viewports.push( new LayoutViewport() );
		}

		var bg_color = null;
		if(LS.GlobalScene.root && LS.GlobalScene.root.camera)
			bg_color = LS.GlobalScene.root.camera.background_color;

		for(var i = 0; i < this.viewports.length; ++i )
		{
			var viewport = this.viewports[i];
			viewport.index = i;
			if( old_viewports[i] )
				viewport.copyFromLayout( old_viewports[i] );

			var editor_camera = viewport.editor_camera;
			if(bg_color)
				editor_camera.background_color.set( bg_color );

			this.cameras.push( viewport.camera );
		}

		
		this.camera = this.selected_camera = this.cameras[0];
		this.requestFrame();
	},

	setViewportCamera: function( index, new_camera )
	{
		var viewport = this.viewport[ index ];
		if(!viewport)
		{
			console.warn("Unknown viewport index");
			return;
		}

		viewport.camera = new_camera;
		viewport.camera._viewport.set( viewport._viewport );
	},

	relaunch: function() { 
		console.log("Relaunching...");
		RenderModule.canvas_manager.gl.relaunch(); 
	},

	appendViewportTo: function(parent)
	{
		var canvas = this.canvas_manager.canvas;
		if(!canvas)
			return;

		if(parent)
			parent.appendChild(canvas);
		else
			document.getElementById("maincanvas").appendChild(canvas);
		RenderModule.canvas_manager.resize();
		RenderModule.requestFrame();
		return canvas;
	},

	getCanvas: function()
	{
		return this.canvas_manager.canvas;
	},

	//called by the CanvasManager on requestAnimationFrame
	render: function( context, force_render )
	{
		if(context === true) //allows to pass the second parameter as first
		{
			context = gl;
			force_render = true;
		}

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
		this.canvas_manager.frame_rendered = true;

		if( this._overwrite_render_callback )
		{
			if( this._overwrite_render_callback( this.selected_camera ) === true )
				return;
		}

		var global_render_settings = this.render_settings;
		var scene_render_settings = LS.GlobalScene.info ? LS.GlobalScene.info.render_settings : global_render_settings;
		render_settings = global_render_settings.in_player ? scene_render_settings : global_render_settings;

		//check if render one single camera or multiple cameras
		var cameras = null;
		if(!global_render_settings.in_player && !this.view_from_scene_cameras )
		{
			cameras = this.getLayoutCameras(); //clone
			//search for render to texture cameras, puts them at the beginning
			var scene_cams = LS.GlobalScene._cameras;
			for(var i in scene_cams)
			{
				var cam = scene_cams[i];
				if(cam.isRenderedToTexture())
					cameras.unshift(cam); //add this camera to the list of cameras we are going to use to render
			}
			render_settings.main_camera = this.selected_camera;
		}
		else
		{
			this.resetLayoutCameras();
		}

		//theoretically this is not necessary, but just in case
		gl.viewport(0,0,gl.canvas.width, gl.canvas.height);

		LEvent.trigger(this,"pre_scene_render");
		gl.clear( gl.DEPTH_BUFFER_BIT ); //¿?

		//render frame
		if( this.special_pass ) 
			this.renderSpecialPass( this.special_pass ); //used for debug mostly
		else
		{
			LS.Renderer.resetState(); //in case some error stopped the rendering inm the previous frame
			LS.Renderer.render( LS.GlobalScene, render_settings, cameras );
		}

		if(this.view_safe_frame)
			this.renderSafeFrame();

		LEvent.trigger(this,"post_scene_render");
	},

	renderSafeFrame: function()
	{
		var w = 800;
		var h = 600;
		var x = (gl.drawingBufferWidth - w) * 0.5;
		var y = (gl.drawingBufferHeight - h) * 0.5;
		gl.start2D();
		gl.strokeStyle = "white";
		gl.globalAlpha = 0.5;
		gl.strokeRect(x,y,w,h);
		gl.strokeRect(gl.drawingBufferWidth*0.5,0, 0.5,gl.drawingBufferHeight);
		gl.strokeRect(0,gl.drawingBufferHeight*0.5, gl.drawingBufferWidth, 0.5);
		gl.globalAlpha = 1;
	},


	//binded to the LS.Renderer so we can add special passes on top of the render
	onAfterRenderInstances: function()
	{
		if(this.show_stencil_mask > -1)
		{
			gl.disable( gl.DEPTH_TEST );
			LS.Renderer._black_texture.toViewport();
			gl.enable( gl.STENCIL_TEST );
			gl.stencilFunc( GL.EQUAL, this.show_stencil_mask, 0xFF );
			LS.Renderer._white_texture.toViewport();
			gl.disable( gl.STENCIL_TEST );
		}
		else if(this.show_depth_buffer ) //superhack to render the depth buffer by rendering lots of planes with different Z
		{
			if(!this._depth_shader)
				this._depth_shader = new GL.Shader( this._depth_vertex_shader_code, this._depth_fragment_shader_code );
			var mesh = GL.Mesh.getScreenQuad();

			var camera = LS.Renderer._current_camera;
			var N = camera.near;
			var F = camera.far;
			gl.enable( gl.DEPTH_TEST );
			gl.depthMask( false );
			gl.depthFunc( gl.LESS );
			gl.disable( gl.CULL_FACE );
			gl.disable( gl.BLEND );
			var slices = 128;
			for(var i = 0; i <= slices; ++i)
			{
				var linear_f = i/slices;
				//linear_f = (2.0 * N) / (F + N - D * (F - N));
				var depth = Math.pow(linear_f,0.01);
				this._depth_shader.uniforms({u_color: linear_f, u_depth: depth}).draw(mesh);
			}
			gl.depthMask( true );
			gl.depthFunc( gl.LESS );
		}
	},

	//used for debug, allows to render shadows or picking buffers directly to screen
	renderSpecialPass: function( pass )
	{
		if( pass == "picking" )
		{
			LS.Picking.renderPickingBuffer( LS.GlobalScene, this.cameras[0], 0xFFFF );
		}
		else
		{
			LS.Renderer.setRenderPass( pass );
			LS.Renderer.renderInstances( new LS.RenderSettings() );
		}
	},

	//used by playModule and renderModule to pass events to LiteScene
	//returns true if it must stop propagation
	passEventToLiteScene: function(e)
	{
		var blocked = false;
		switch(e.type)
		{
			case "mousedown":
			case "mousemove":
			case "mouseup":
				blocked = LS.Input.onMouse(e);
				if( !blocked ) //send event only if not blocked
					LEvent.trigger( LS.GlobalScene, e.eventType || e.type, e, true );
				break;
			case "keydown":
			case "keyup":
				LS.Input.onKey(e);
				//no break to call the trigger
			default:
				LEvent.trigger( LS.GlobalScene, e.eventType || e.type, e, false );
		}

		return blocked;
	},

	//used to select viewport
	mousedown: function(e)
	{
		var viewport = this.getViewportUnderMouse(e);
		if(!viewport)
			return;
		this.selected_viewport = viewport;
		return viewport.onMouseDown(e);
	},

	//used to change the viewport below the mouse
	mousemove: function(e)
	{
		var viewport = this.getViewportUnderMouse(e);
		if(!viewport)
			return;
		if( this.active_viewport && viewport != this.active_viewport )
			this.active_viewport.onMouseLeave(e);
		this.active_viewport = viewport;
		return viewport.onMouseMove(e);
	},

	getActiveViewport: function()
	{
		if(!this.active_viewport)
			this.active_viewport = this.viewports[0];
		return this.active_viewport;
	},

	getActiveCamera: function()
	{
		if(!this.active_viewport)
			this.active_viewport = this.viewports[0];
		return this.active_viewport.camera;
	},

	getLayoutCameras: function()
	{
		var r = [];
		for(var i = 0; i < this.viewports.length; ++i)
		{
			var layout_viewport = this.viewports[i];
			var camera = layout_viewport.camera;
			camera.viewport = layout_viewport._viewport; //force set
			r.push( camera );
		}
		return r;
	},

	resetLayoutCameras: function()
	{
		for(var i = 0; i < this.viewports.length; ++i)
		{
			var layout_viewport = this.viewports[i];
			if( !layout_viewport.scene_camera )
				continue;
			layout_viewport.scene_camera._viewport.set( layout_viewport.scene_camera_original_viewport );
		}
	},

	getViewportUnderMouse: function(e)
	{
		GL.augmentEvent( e, gl.canvas );
		var viewports = this.viewports;
		for(var i = viewports.length-1; i >= 0; --i)
		{
			var layout_viewport = viewports[i];
			if( layout_viewport.isPointInViewport( e.canvasx, e.canvasy ) )
				return layout_viewport;
		}
		return null;
	},

	setRenderMode: function(v)
	{
		this.render_mode = v;

		this.render_settings.force_shader = null;
		this.render_settings.force_wireframe = false;
		this.render_settings.shadows_disabled = false;
		this.render_settings.lights_disabled = false;

		if(v == "wireframe")
		{
			this.render_settings.force_shader = "flat";
			this.render_settings.force_wireframe = true;
			this.render_settings.shadows_disabled = true;
			this.render_settings.lights_disabled = true;
		}
		else if(v == "flat")
		{
			this.render_settings.force_shader = "flat";
			this.render_settings.shadows_disabled = true;
			this.render_settings.lights_disabled = true;
		}
		else if(v == "solid")
		{
			this.render_settings.force_shader = "phong";
			this.render_settings.shadows_disabled = true;
		}
		else if(v == "texture")
		{
			this.render_settings.force_shader = "flat_texture";
			this.render_settings.shadows_disabled = true;
			this.render_settings.lights_disabled = true;
		}

		this.requestFrame();
	},

	changeCameraType: function(type)
	{
		var camera = this.selected_camera || this.camera;
		camera.type = type;
		this.requestFrame();
	},

	requestFrame: function()
	{
		LS.GlobalScene.refresh();
	},

	setAutoSelect: function(v)
	{
		cameraTool.auto_select = v;
	},

	setCameraMode: function(mode)
	{
		cameraTool.mode = mode;
	},

	//called 
	onSerialize: function(e, o)
	{
		if(!o.extra)
			o.extra = {};

		var viewport_layout = o.extra.viewport_layout = {
			mode: this.viewports_mode,
			viewports: []	
		};

		//save cameras
		for(var i in this.viewports )
		{
			var viewport = this.viewports[i];
			viewport_layout.viewports.push( viewport.serialize() );
		}
	},

	onConfigure: function(e, o)
	{
		if(!o.extra || !o.extra.viewport_layout)
			return;

		//Restore cameras
		var viewport_layout = o.extra.viewport_layout;
		if(viewport_layout.viewports)
		{
			RenderModule.setViewportLayout( viewport_layout.mode );
			for(var i = 0; i < viewport_layout.viewports.length; ++i )
			{
				var viewport_info = viewport_layout.viewports[i];
				if( RenderModule.viewports[i] )
					RenderModule.viewports[i].configure( viewport_info );
			}
		}
	},

	onSceneLoaded: function(e)
	{
		var color = null;
		if(LS.GlobalScene.root.camera)
			color = LS.GlobalScene.root.camera.background_color;
		else
			color = [0,0,0,0];

		for(var i in this.viewports )
		{
			var viewport = this.viewports[i];
			viewport.camera.background_color.set( color );
		}
	},

	/**
	* Renders the material preview to an image (or to the screen)
	*
	* @method renderMaterialPreview
	* @param {Material} material
	* @param {number} size image size
	* @param {Object} options could be environment_texture, to_viewport
	* @param {HTMLCanvas} canvas [optional] the output canvas where to store the preview
	* @return {Image} the preview image (in canvas format) or null if it was rendered to the viewport
	*/
	renderMaterialPreview: function( material, size, options, canvas )
	{
		options = options || {};

		if(!material)
		{
			console.error("No material provided to renderMaterialPreview");
			return;
		}

		//create scene
		var scene = LS.Renderer._material_scene;
		if(!scene)
		{
			scene = LS.Renderer._material_scene = new LS.Scene();
			scene.root.camera.background_color.set([0.0,0.0,0.0,0]);
			if(options.environment_texture)
				scene.info.textures.environment = options.environment_texture;
			var node = new LS.SceneNode( "sphere" );
			var compo = new LS.Components.GeometricPrimitive( { size: 40, subdivisions: 50, geometry: LS.Components.GeometricPrimitive.SPHERE } );
			node.addComponent( compo );
			scene.root.addChild( node );
		}

		if(!LS.Renderer._preview_material_render_settings)
			LS.Renderer._preview_material_render_settings = new LS.RenderSettings({ skip_viewport: true, render_helpers: false, update_materials: true });
		var render_settings = LS.Renderer._preview_material_render_settings;

		if(options.background_color)
			scene.root.camera.background_color.set(options.background_color);

		var node = scene.getNode( "sphere");
		if(!node)
		{
			console.error("Node not found in Material Preview Scene");
			return null;
		}

		if(options.rotate)
		{
			node.transform.reset();
			node.transform.rotateY( options.rotate );
		}

		var new_material = null;
		if( material.constructor === String )
			new_material = material;
		else
		{
			new_material = new material.constructor();
			new_material.configure( material.serialize() );
		}
		node.material = new_material;

		if(options.to_viewport)
		{
			LS.Renderer.renderFrame( scene.root.camera, render_settings, scene );
			return;
		}

		var tex = LS.Renderer._material_preview_texture || new GL.Texture(size,size);
		if(!LS.Renderer._material_preview_texture)
			LS.Renderer._material_preview_texture = tex;

		tex.drawTo( function()
		{
			//it already clears everything
			//just render
			LS.Renderer.renderFrame( scene.root.camera, render_settings, scene );
		});

		var canvas = tex.toCanvas( canvas, true );
		return canvas;
	},

	//returns string or blob
	takeScreenshot: function( width, height, on_complete )
	{
		width = width || 256;
		height = height || 256;
		var v3d = RenderModule.canvas_manager;

		if( v3d.canvas.width > width ) //render big and downscale
		{
			this.render(true); //change render_settings?
			var canvas = createCanvas( width, height );
			//document.body.appendChild(canvas);
			var ctx = canvas.getContext("2d");
			var scalew = width / v3d.canvas.width;
			var scaleh = height / v3d.canvas.height;
			var scale = Math.max( scalew, scaleh ); //the biggest so it fits all
			if(scale == scaleh )
				ctx.translate( ((scale * v3d.canvas.width) - width) * -0.5, 0 );
			else
				ctx.translate( 0, ((scale * v3d.canvas.height) - height) * -0.5 );
			ctx.scale( scale, scale );
			ctx.drawImage( v3d.canvas, 0, 0 );
			if(on_complete)
			{
				canvas.toBlob( on_complete, "image/png");
				RenderModule.render(true); //force render a frame to clean 
				return null;
			}
			data = canvas.toDataURL("image/png");
		}
		else //render to specific size
		{
			var old = [v3d.canvas.width,v3d.canvas.height];
			v3d.resize(width,height);
			
			this.render(true);
			var data = null;
			
			if(on_complete)
			{
				v3d.canvas.toBlob( on_complete, "image/png");
				v3d.resize(old[0],old[1]);
				RenderModule.render(true); //force render a frame to clean 
				return null;
			}

			data = v3d.canvas.toDataURL("image/png");
			v3d.resize(old[0],old[1]);
			this.render(true); //force render a frame to clean 
		}
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
			EditorModule.inspect( RenderModule.cameras );
		};
	},

	getNodeAtCanvasPosition: function(x,y)
	{
		var instance_info = LS.Picking.getInstanceAtCanvasPosition( x, y, ToolUtils.getCamera() );
		if(!instance_info)
			return null;
		if( instance_info.constructor == LS.SceneNode)
			return instance_info;
		return instance_info.node;
	},

	testGridCollision: function(x,y)
	{
		if(x === undefined || y === undefined)
			throw("testGridCollision: params missing");
		var camera = ToolUtils.getCamera();
		var ray = camera.getRayInPixel( x, y );
		var position = vec3.create();
		if( geo.testRayPlane( ray.origin, ray.direction, vec3.create(), vec3.fromValues(0,1,0), position ) )
			return position;
		return null;
	},

	onWebGLNotEnabled: function()
	{
		var dialog = LiteGUI.alert("WebGL is disabled in your browser.<br/> You must use a recent browser like Chrome or Firefox updated to the last version in order to use this tool.");
		dialog.setSize(400,200);

		this.canvas_container.innerHTML = "WEBGL is disabled</br><a href='http://superuser.com/questions/836832/how-can-i-enable-webgl-in-my-browser'>Do you need help?</a>";
		this.canvas_container.setAttribute("style","font-size: 4em; padding: 50px; color: #444; text-align: center; width: 100%;");
	}
};

CORE.registerModule( RenderModule );


RenderModule._depth_vertex_shader_code = "\n\
	precision highp float;\n\
	attribute vec3 a_vertex;\n\
	attribute vec2 a_coord;\n\
	uniform float u_depth;\n\
	void main() { \n\
		gl_Position = vec4(a_coord * 2.0 - 1.0, u_depth, 1.0);\n\
	}\n\
";

RenderModule._depth_fragment_shader_code = "\n\
	precision highp float;\n\
	uniform float u_color;\n\
	void main() {\n\
		gl_FragColor = vec4(u_color);\n\
}";


LS.Material.prototype.updatePreview = function(size, options)
{
	options = options || {};

	var res = {};
	this.getResources(res);

	for(var i in res)
	{
		var resource = LS.ResourcesManager.resources[i];
		if(!resource)
		{
			console.warn("Cannot generate preview with resources missing.");
			return null;
		}
	}

	if(LS.GlobalScene.info.textures.environment)
		options.environment = LS.GlobalScene.info.textures.environment;

	size = size || 256;
	var preview = RenderModule.renderMaterialPreview( this, size, options, this._preview );
	if(!preview)
		return;

	this._preview = preview;
	if(preview.toDataURL)
		this._preview_url = preview.toDataURL("image/png");
}



