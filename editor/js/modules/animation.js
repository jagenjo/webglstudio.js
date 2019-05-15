var AnimationModule = {
	name: "Timeline",
	enabled: true,

	render_helpers: true,
	//settings_panel: [{name:"renderer", title:"Renderer", icon:null }],

	_trajectories: [],

	export_animation_formats: {},

	init: function()
	{
		//create the timeline
		this.tab = InterfaceModule.lower_tabs_widget.addWidgetTab( Timeline );
		this.timeline = this.tab.widget;

		LEvent.bind( LS.GlobalScene, "afterRenderScene", this.renderView.bind(this));
		LEvent.bind( LS.GlobalScene, "renderPicking", this.renderPicking.bind(this));

		RenderModule.canvas_manager.addWidget( AnimationModule ); //capture update, render trajectories
		LiteGUI.menubar.add("Actions/Skeletal export", { callback: AnimationModule.showSKAnimExportDialog.bind(AnimationModule) });
	},

	createTimeline: function()
	{
		var timeline = this.timeline = new Timeline();
		this.tab.add( this.timeline );

		InterfaceModule.visorarea.addEventListener( "visibility_change", timeline_resize );
		InterfaceModule.visorarea.addEventListener( "split_moved", timeline_resize );
		window.addEventListener("resize", timeline_resize );

		function timeline_resize(){
			timeline.resize();
		}
	},

	showTimeline: function( animation )
	{
		InterfaceModule.selectTab( RenderModule.tab_name );
		InterfaceModule.setLowerPanelVisibility( true );
		if(animation)
			this.timeline.setAnimation( animation );
	},

	onBulletClick: function( e )
	{
		AnimationModule.insertKeyframe( e.target, e.shiftKey );
		e.preventDefault();
		e.stopPropagation();
		return true;
	},

	onBulletRightClick: function( e )
	{
		var menu = new LiteGUI.ContextMenu( ["Add track [UID]","Add track [name]","Copy Query","Copy Unique Query",null,"Show Info"], { event: e, title:"Property", callback: function(value) {
			if(value == "Add track [UID]")
				AnimationModule.insertKeyframe(e.target);
			else if(value == "Add track [name]")
				AnimationModule.insertKeyframe(e.target, true);
			else if(value == "Copy Query")
				AnimationModule.copyQueryToClipboard( e.target.dataset["propertyuid"], true );
			else if(value == "Copy Unique Query")
				AnimationModule.copyQueryToClipboard( e.target.dataset["propertyuid"] );
			else
				AnimationModule.showPropertyInfo( e.target.dataset["propertyuid"] );
		}});
	},

	onBulletDragStart: function( e )
	{
		var locator = e.target.dataset["propertyuid"];
		if(e.shiftKey)
			locator = LSQ.shortify( locator );

		var info = LSQ.get( locator );
		if(info && info.node)
		{
			var prefab = info.node.insidePrefab();
			if(prefab)
			{
				console.warn("locator belongs to a node in a prefab, converting locator to name");
				locator = LS.convertLocatorFromUIDsToName( locator );
			}
		}

		e.dataTransfer.setData("type", "property" );
		e.dataTransfer.setData("uid", locator );
		e.dataTransfer.setData("locator", locator );
	},

	copyQueryToClipboard: function( locator, shorten )
	{
		//shortify query
		if(shorten)
			locator = LSQ.shortify( locator );
		LiteGUI.toClipboard( locator );
	},

	showPropertyInfo: function( property )
	{
		var info = LS.GlobalScene.getPropertyInfo( property );
		if(!info)
			return;

		var that = this;
		var dialog = new LiteGUI.Dialog("property_info",{ title:"Property Info", width: 400, draggable: true, closable: true });
		
		var widgets = new LiteGUI.Inspector();
		var locator_widget = widgets.addString("Locator", property, function(v){});
		/*
		locator_widget.style.cursor = "pointer";
		locator_widget.setAttribute("draggable","true");
		locator_widget.addEventListener("dragstart", function(event) { 
			event.dataTransfer.setData("locator", property );
			event.dataTransfer.setData("type", "property");
			if(info.node)
				event.dataTransfer.setData("node_uid", info.node.uid);
			//event.preventDefault();
		});
		*/
		
		widgets.addString("Short Locator", LSQ.shortify( property ), function(v){});

		widgets.widgets_per_row = 2;
		widgets.addString("Parent", info.node ? info.node.name : "", { disabled: true } );
		widgets.addString("Container", info.target ? LS.getObjectClassName( info.target ) : "", { disabled: true } );
		widgets.addString("Property", info.name, { disabled: true } );
		widgets.addString("Type", info.type, { disabled: true } );
		widgets.widgets_per_row = 1;

		if(info.type == "number")
			widgets.addNumber("Value", info.value, inner_set );
		else if(info.type == "boolean")
			widgets.addCheckbox("Value", info.value, inner_set );
		else if(info.type == "vec2")
			widgets.addVector2("Value", info.value, inner_set );
		else if(info.type == "vec3")
			widgets.addVector3("Value", info.value, inner_set );
		else if(info.type == "texture")
			widgets.addTexture("Value", info.value, inner_set );
		else if(info.type == "mesh")
			widgets.addMesh("Value", info.value, inner_set );
		else
			widgets.addString("Value", info.value, inner_set );
		widgets.addButtons(null,["Close"], function(v){
			dialog.close();
			return;
		});

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();

		function inner_set(v)
		{
			LS.GlobalScene.setPropertyValue( property, v );
			LS.GlobalScene.refresh();
		}
	},

	showAnimationTakeOptionsDialog: function( animation, timeline )
	{
		var that = this;
		var dialog = new LiteGUI.Dialog({ title:"Take Options", closable: true, width: 600, draggable: true } );

		var area = new LiteGUI.Area();
		area.split("horizontal",["50%",null]);
		dialog.add( area );

		var widgets1 = new LiteGUI.Inspector();
		widgets1.on_refresh = inner_refresh_left;
		area.getSection(0).add( widgets1 );

		var widgets2 = new LiteGUI.Inspector();
		widgets2.on_refresh = inner_refresh_right;
		area.getSection(1).add( widgets2 );

		var selected_take_name = "default";
		var new_take_name = "new_take";
		var action = null;

		inner_refresh_left();
		inner_refresh_right();
		dialog.show();

		function inner_refresh_left()
		{
			var widgets = widgets1;

			var selected_take = animation.takes[ selected_take_name ];
			var duration = selected_take ? selected_take.duration : 0;
			var tracks = selected_take ? selected_take.tracks.length : 0;

			widgets.clear();
			widgets.addString("Animation", animation.name );
			widgets.addTitle("Takes");
			var takes = [];
			for( var i in animation.takes )
				takes.push( i );
			widgets.addList( null, takes, { height: 180, selected: selected_take_name, callback: function(v){
				selected_take_name = v;
				widgets1.refresh();
				widgets2.refresh();
			}});
			widgets.addButtons( null, ["Clone","Copy","Paste","Delete"], function(v){
				if(v == "Clone")
				{
					var data = selected_take.serialize();
					var take = new LS.Animation.Take();
					take.configure( data );
					if( animation.takes[ take.name ] )
						take.name = take.name + ((Math.random() * 100)|0);
					selected_take_name = take.name;

					that.addUndoAnimationEdited( animation, timeline );
					animation.addTake( take );
					that.animationModified( animation, timeline );

					if(timeline)
						timeline.setAnimation( animation, selected_take_name );
				}
				else if(v == "Copy")
				{
					var data = selected_take.serialize();
					data._object_class = "LS.Animation.Take";
					if( selected_take )
						LiteGUI.toClipboard( data, true );
				}
				else if(v == "Paste")
				{
					var data = LiteGUI.getLocalClipboard();
					if(!data || data._object_class !== "LS.Animation.Take")
						return;
					var take = new LS.Animation.Take();
					take.configure( data );
					if( animation.takes[ take.name ] )
						take.name = take.name + ((Math.random() * 100)|0);
					selected_take_name = take.name;
					that.addUndoAnimationEdited( animation, timeline );
					animation.addTake( take );
					that.animationModified( animation, timeline );

					if(timeline)
						timeline.setAnimation( animation, selected_take_name );
				}
				else if(v == "Delete")
				{
					if( animation.getNumTakes() <= 1 )
						return;
					that.addUndoAnimationEdited( animation, timeline );
					animation.removeTake( selected_take_name );
					selected_take_name = Object.keys( animation.takes )[0];
					if(timeline)
						timeline.setAnimation( animation, selected_take_name );
					that.animationModified( animation, timeline );
				}
				widgets1.refresh();
				widgets2.refresh();
				EditorModule.refreshAttributes();
			});

			widgets.addTitle("Create New take");
			widgets.addString("Name",new_take_name,{ callback: function(v){
				new_take_name = v;
			}});
			widgets.addButton( null, "Create Take", inner_new_take);

			dialog.adjustSize(10);
		}

		function inner_refresh_right()
		{
			var widgets = widgets2;

			var selected_take = animation.takes[ selected_take_name ];
			console.log(selected_take);
			var duration = selected_take ? selected_take.duration : 0;
			var tracks = selected_take ? selected_take.tracks.length : 0;

			widgets.clear();

			widgets.addTitle("Animation");
			widgets.addString("Name", animation.fullpath || animation.filename );

			widgets.addTitle("Selected Take");
			widgets.addStringButton("Name",selected_take_name,{ button: "&#9998;", callback_button: function(v){
				that.addUndoAnimationEdited( animation, timeline );
				animation.renameTake( selected_take_name, v );
				selected_take_name = v;
				that.animationModified( animation, timeline );
				if(timeline)
					timeline.setAnimation( animation, selected_take_name );
				widgets1.refresh();
				widgets2.refresh();
			}});

			widgets.widgets_per_row = 2;
			widgets.addString("Duration", duration + "s");
			widgets.addString("Num. Tracks", tracks|0 );
			widgets.widgets_per_row = 1;

			//actions
			widgets.addTitle("Actions on Take");

			widgets.widgets_per_row = 2;
			var values = [];

			for(var i in Timeline.actions.take)
				values.push(i);

			action = action || values[0];
			widgets.addCombo("Actions", action, { values: values, width: "80%", callback: function(v){
				action = v;	
			}});

			widgets.addButton(null,"Go",{ width: "20%", callback: function(){
				var total = 0;

				var action_callback = Timeline.actions.take[ action ];
				if(!action_callback || !selected_take)
					return;

				total = action_callback( animation, selected_take, inner_callback );

				if(timeline)
					timeline.redrawCanvas();

				if(total != null)
				{
					LiteGUI.alert("Tracks modified: " + total);
					if(total)
						that.animationModified( animation, timeline );
				}

				//dialog.close(); //close after action

				function inner_callback(total)
				{
					LiteGUI.alert("Tracks modified: " + total);
					if(total)
						that.animationModified( animation, timeline );
				}
			}});
			widgets.widgets_per_row = 1;

			//interpolation
			widgets.widgets_per_row = 2;
			var interpolation = Timeline.interpolation_values["linear"];
			widgets.addCombo("Set Interpolation to all tracks", interpolation, { values: Timeline.interpolation_values, width: "80%", callback: function(v){
				interpolation = v;	
			}});

			widgets.addButton(null,"Go",{ width: "20%", callback: function(){
				var total = selected_take.setInterpolationToAllTracks( interpolation );
				if(total != null)
					LiteGUI.alert("Tracks modified: " + total);
				if(total)
					that.animationModified( animation, timeline );
			}});
			widgets.widgets_per_row = 1;

			widgets.addTitle("Trim the tracks");
			widgets.widgets_per_row = 3;
			var from_widget = widgets.addNumber("from", 0, { name_width: 40 } );
			var to_widget = widgets.addNumber("to", duration, { name_width: 40 } );
			widgets.addButton(null,"TRIM", function(){
				var from_t = from_widget.getValue();
				var to_t = to_widget.getValue();
				var total = selected_take.trimTracks( from_t, to_t );
				if(total)
					that.animationModified( animation, timeline );
			});
			widgets.widgets_per_row = 1;

			widgets.addTitle("Stretch");
			widgets.widgets_per_row = 2;
			var stretch_widget = widgets.addNumber("To duration", duration, { min: 0.01 } );
			widgets.addButton(null,"STRETCH", function(){
				var new_duration = stretch_widget.getValue();
				if(new_duration == selected_take.duration)
					return;
				var total = selected_take.stretchTracks( new_duration );
				that.duration_widget.setValue( new_duration, true );
				if(total)
					that.animationModified( animation, timeline );
			});
			widgets.widgets_per_row = 1;

			widgets.addTitle("Export");
			widgets.widgets_per_row = 2;
			var export_selection = "anim";
			widgets.addCombo("Format", export_selection, { values: Object.keys( AnimationModule.export_animation_formats ), width: "50%", callback: function(v){
				export_selection = v;
			}});
			widgets.addButton(null,"Export", { width: "50%", callback: function(){
				var exporter = AnimationModule.export_animation_formats[ export_selection ];
				if(!exporter)
					return;
				var data = exporter( selected_take );
				if(!data)
					return;
				LiteGUI.downloadFile( selected_take.name + "." + export_selection, data, data.constructor === String ? "text/plain" : "application/octet-stream" );
			}});
			widgets.widgets_per_row = 1;
			
			dialog.adjustSize(10);
		}

		function inner_new_take()
		{
			that.addUndoAnimationEdited( animation, timeline );
			animation.createTake( new_take_name );
			selected_take_name = new_take_name;
			if(timeline)
				timeline.setAnimation( animation, selected_take_name );
			widgets1.refresh();
		}
	},

	animationModified: function( animation, timeline )
	{
		if(!animation)
			return;
		animation._modified = true;

		//add UNDO
		//animation.toBinary()// too expensive... must create track undos or keyframe undos...

		LS.ResourcesManager.resourceModified( animation );
		LS.GlobalScene.refresh();

		if(timeline)
			timeline.redrawCanvas();
	},

	addUndoAnimationEdited: function( animation, timeline )
	{
		if(!animation)
			return;

		var that = this;

		UndoModule.addUndoStep({ 
			title: "Animation modified: " + animation.name,
			data: { animation_name: animation.name, data: animation.serialize() },
			callback_undo: function(d) {
				var anim = d.animation_name == LS.Animation.DEFAULT_SCENE_NAME ? LS.GlobalScene.animation : LS.ResourcesManager.resources[ d.animation_name ];
				if(!anim)
					return;
				d.new_data = anim.serialize();
				anim.configure( d.data );
				that.animationModified(anim, timeline);
			},
			callback_redo: function(d) {
				var anim = d.animation_name == LS.Animation.DEFAULT_SCENE_NAME ? LS.GlobalScene.animation : LS.ResourcesManager.resources[ d.animation_name ];
				if(!anim)
					return;
				anim.configure( d.new_data );
				that.animationModified( anim, timeline );
			}
		});
	},

	getKeyframeCode: function( target, property, options )
	{
		if(!target.getLocator)
			return "";
		var locator = target.getLocator();
		if(!locator)
			return "";

		var prefab = LS.checkLocatorBelongsToPrefab( locator );
		if( prefab )
			locator = LS.convertLocatorFromUIDsToName( locator );

		return "<span title='Create keyframe for "+property+"' class='keyframe_icon' data-propertyname='" + property + "' data-propertyuid='" + locator + "/" + property + "' ></span>";
	},

	insertKeyframe: function( button, relative )
	{
		this.timeline.onInsertKeyframeButton( button, relative );
		this.tab.click();
	},

	renderView: function(e, camera)
	{
		if( !EditorView.render_helpers || !this.render_helpers || RenderModule.render_settings.in_player || !RenderModule.frame_updated )
			return;


		if(this.timeline.show_paths)
		{
			var rect = this.timeline.root.getBoundingClientRect();
			if(rect.width && rect.height)
				this.renderTrajectories(camera);
		}
	},

	renderPicking: function(e, mouse_pos)
	{
		//cannot pick what is hidden
		if(!EditorView.render_helpers || !this._trajectories.length )
			return;

		var temp = vec3.create();
		var callback = this.onTrajectoryKeyframeClicked.bind(this);

		for(var i = 0; i < this._trajectories.length; ++i)
		{
			var traj = this._trajectories[i];

			var info = LS.GlobalScene.getPropertyInfoFromPath( traj.track._property_path );
			if(!info)
				continue;

			var parent_matrix = null;
			if( info.node && info.node.parentNode && info.node.parentNode.transform )
				parent_matrix = info.node.parentNode.transform.getGlobalMatrixRef();

			var points = traj.points;
			var num = points.length;
			for(var j = 0; j < num; ++j)
			{
				var pos = points[j];
				if( parent_matrix )
					pos = vec3.transformMat4( vec3.create(), pos, parent_matrix );
				EditorView.addPickingPoint( pos, 10, { pos: pos, value: points[j], type: "keyframe", traj:i, instance: this, take: this.timeline.current_take, track: traj.index, num: j, callback: callback } );
			}
		}
	},

	renderTrajectories: function( camera )
	{
		LS.Renderer.resetGLState();

		if(!this.timeline.current_take)
			return;

		var take = this.timeline.current_take;
		if(take.tracks.length == 0)
			return;

		var selection = SelectionModule.getSelection();
		if(!selection || selection.type != "keyframe")
			selection = null;

		this._trajectories.length = 0;
		var white = [1,1,1,1];
		var colorA = [0.5,0.6,0.5,1];
		var colorB = [1.0,1.0,0.5,1];

		for(var i = 0; i < take.tracks.length; ++i)
		{
			var track = take.tracks[i];
			if( track.type != "vec3" || !track.enabled)
				continue;

			var num = track.getNumberOfKeyframes();
			var start = -1;
			var end = -1;
			var points = [];
			var colors = null;
			if( selection && selection.track == i )
				colors = [];

			var info = LS.GlobalScene.getPropertyInfoFromPath( track._property_path );
			if(!info) //unknown case but it happened sometimes
				continue;

			var parent_node = null;
			if( info.node && info.node.parentNode && info.node.parentNode.transform )
			{
				parent_node = info.node.parentNode;
				LS.Draw.push();
				LS.Draw.setMatrix( parent_node.transform.getGlobalMatrixRef() );
			}

			for(var j = 0; j < num; ++j)
			{
				var keyframe = track.getKeyframe(j);
				if(!keyframe)
					continue;
				if(j == 0)
					start = keyframe[0];
				else if(j == num - 1)
					end = keyframe[0];
				var pos = keyframe[1];
				points.push(pos);
				if(colors)
					colors.push( j == selection.index ? colorB : colorA );
			}

			LS.Draw.setColor( colors ? white : colorA );
			LS.Draw.setPointSize( 4 );
			LS.Draw.renderPoints( points, colors );
			this._trajectories.push( { index: i, points: points, track: track } );

			if(track.interpolation == LS.Animation.NONE)
				continue;

			if(track.interpolation == LS.Animation.LINEAR)
			{
				if(points.length > 1)
					LS.Draw.renderLines( points, null, true );
				continue;
			}

			points = [];

			var last = null;
			for(var j = 0; j < num; ++j)
			{
				var keyframe = track.getKeyframe(j);
				if(!keyframe)
					continue;
				if(last)
				{
					var start_t = last[0];
					var end_t = keyframe[0];
					var num_samples = Math.max(2, (end_t - start_t) * 10);
					var offset = (end_t - start_t) / num_samples;
					for(var k = 0; k <= num_samples; ++k)
					{
						var t = start_t + offset * k;
						var sample = track.getSample(t, true, vec3.create());
						if(!sample)
							continue;
						points.push(sample);
					}
				}
				last = keyframe;
			}

			if(points.length > 1)
			{
				LS.Draw.setColor(colorA);
				LS.Draw.renderLines( points, null, false );
			}

			if( parent_node )
				LS.Draw.pop();
		}
	},

	onTrajectoryKeyframeClicked: function(info, e)
	{
		this.timeline.selectKeyframe( info.track, info.num );
	},

	getTransformMatrix: function( element, mat, selection )
	{
		if(!this._trajectories.length)
			return false;

		var T = mat || mat4.create();
		mat4.setTranslation( T, selection.pos );
		return T;
	},

	applyTransformMatrix: function( matrix, center, property_name, selection )
	{
		if(!this._trajectories.length)
			return false;

		var track = this._trajectories[ selection.traj ];
		if(!track)
			return null;

		var point = track.points[ selection.num ];
		vec3.transformMat4( point, point, matrix );
		if(selection.pos != selection.value) //update the visual point
			vec3.transformMat4( selection.pos, selection.pos, matrix );
		this.timeline.applyTracks();
		return true;
	},

	update: function(dt)
	{
		if( this.timeline )
			this.timeline.update(dt);
	},

	showSKAnimExportDialog: function()
	{
		var dialog = new LiteGUI.Dialog({ id:"dialog_skanim_exporter", title:"SKAnim exporter", close: true, minimize: true, width: 400, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);
		this.dialog = dialog;

		var widgets = new LiteGUI.Inspector({ name_width: 100 });
		dialog.add( widgets );

		var anim = null;
		var take = null;
		var anim_filename = "animation";
		var duration = 1;
		var frames_per_second = 30;
		var mesh_filename = "character";

		//fetch
		var playanim = LS.GlobalScene.root.findComponents("PlayAnimation")[0];
		if(playanim && playanim.getAnimation())
		{
			anim = playanim.getAnimation();
			anim_filename = LS.RM.getBasename(anim.filename);
			take = playanim.getTake();
			duration = take.duration;
		}

		var skindeformer = LS.GlobalScene.root.findComponents("SkinDeformer")[0];
		if(skindeformer)
			mesh = skindeformer._root.getMesh();

		widgets.on_refresh = inner_refresh;
		inner_refresh();
		dialog.adjustSize(10);

		function inner_refresh()
		{
			widgets.clear();
			widgets.addTitle("Animation");
			widgets.widgets_per_row = 2;
			widgets.addString("Animation", anim ? anim.filename : "", { name_width: 80, width: "calc( 100% - 80px )", callback: function(v){ 
				anim = LS.RM.getResource(anim);
				if(anim)
					take = anim.takes["default"];
				inner_refresh();
			}});
			widgets.addButton(null,"From node",{ width: 80, callback: inner_from_node });

			widgets.addNumber("Duration", duration, { min: 0, callback: function(v){ duration = v; }});
			widgets.addNumber("Frames per second",frames_per_second, { min: 1, callback: function(v){ frames_per_second = v; }});
			widgets.widgets_per_row = 1;
			widgets.addString("Filename",anim_filename, { callback: function(v){ filename = v; }});
			widgets.addButton(null,"Export Animation", { callback: inner_export_anim });
			widgets.addSeparator();
			widgets.addTitle("Mesh");
			widgets.widgets_per_row = 2;
			widgets.addMesh("Mesh",mesh ? mesh.filename : "", { name_width: 80, width: "calc( 100% - 80px )", callback: function(v){ 
				mesh = LS.RM.getResource(v); 
				inner_refresh();
			}});
			widgets.addButton(null,"From node",{ width: 80, callback: inner_mesh_from_node });
			widgets.widgets_per_row = 1;
			widgets.addString("Filename",mesh_filename, { callback: function(v){ mesh_filename = v; }});
			widgets.addButton(null,"Export Mesh", { callback: inner_export_mesh });
		}

		function inner_from_node()
		{
			var node = SelectionModule.getSelectedNode();
			if(!node)
				return LiteGUI.alert("No node selected");
			var comp = node.getComponent("PlayAnimation");
			if(!comp)
				return LiteGUI.alert("No PlayAnimation in node");
			take = comp.getTake();
			if(!take)
				return LiteGUI.alert("No Animation in node");
			duration = take.duration;
			var anim = comp.getAnimation();
			anim_filename = LS.RM.getBasename(anim.filename);
			inner_refresh();
		}		

		function inner_export_anim()
		{
			if(!take)
				return LiteGUI.alert("You must select a node that contains a PlayAnimation, select the root node of your DAE and click From Selected Node.");
			var data = exportTakeInSKANIM( take, frames_per_second, duration );
			if(!data)
				return;
			LiteGUI.downloadFile( anim_filename + ".skanim", data );
		}

		function inner_mesh_from_node()
		{
			var node = SelectionModule.getSelectedNode();
			if(!node)
				return LiteGUI.alert("No node selected");
			var comp = node.getComponent("MeshRenderer");
			if(!comp)
				return LiteGUI.alert("No MeshRenderer in node");
			mesh = comp.getMesh();
			if(!mesh)
				return LiteGUI.alert("No mesh found");
			inner_refresh();
		}		

		function inner_export_mesh()
		{
			if(!mesh)
				return LiteGUI.alert("You must select a node that contains a MeshRenderer, select the mesh and click the From Selected Node");
			var data = GL.Mesh.encoders["mesh"](mesh);
			if(!data)
				return;
			LiteGUI.downloadFile( mesh_filename + ".mesh", data );
		}
	}

};

CORE.registerModule( AnimationModule );


LS.Animation.prototype.inspect = function( widgets, skip_default_widgets )
{
	var animation = this;

	widgets.addTitle("Takes [Tracks]");

	for(var i in animation.takes)
		widgets.addInfo(i, animation.takes[i].tracks.length);
	widgets.addButton(null,"Edit Takes", function(){
		AnimationModule.showAnimationTakeOptionsDialog( animation );
	});

	if(!skip_default_widgets)
		DriveModule.addResourceInspectorFields( this, widgets );
}


AnimationModule.export_animation_formats["anim"] = function( take ){
	var lines = [];
	lines.push( [take.name,take.duration,take.tracks.length].join(",") );
	for(var i = 0; i < take.tracks.length; ++i)
	{
		var track = take.tracks[i];
		track.unpackData();
		var nodename = track.property.split("/")[0];
		var track_str = nodename + "," + track.type + "," + track.data.length + "," + track.data.flat();
		lines.push( track_str );
	}
	return lines.join("\n");
}

//skeletal anim
AnimationModule.export_animation_formats["skanim"] = exportTakeInSKANIM;
	
function exportTakeInSKANIM( take, sampling, duration ) {
	sampling = sampling || 30;
	duration = duration || take.duration;
	var total_samples = Math.ceil( sampling * duration );

	var lines = [];
	if(!take.tracks.length)
		return null;

	//find bones
	var bone_names = [];
	var bones = [];
	var bones_by_name = {};
	for(var i = 0; i < take.tracks.length; ++i)
	{
		var track = take.tracks[i];
		if(!track.enabled)
			continue;
		var node = track.getPropertyNode();
		if(!node)
			continue;
		bone_names.push( node.name );
		bones.push( node );
		bones_by_name[ node.name ] = node;
	}

	//find root
	var root = null;
	for(var i = 0; i < bones.length; ++i)
	{
		var bone = bones[i];
		var parent = bone.parentNode;
		if (!parent)
			continue;
		if( bones_by_name[ parent.name ] )
			continue;
		root = bone;
	}

	var out = [];
	var last_bone_index = 0;
	var bone_index = {};
	inner_tree(root,0,out);

	function inner_tree(node,level,out)
	{
		if( !node._is_bone )
			return;
		bone_index[node.name] = last_bone_index++;
		var parent = node.parentNode;
		var parent_index = -1;
		if( bone_index[parent.name] !== undefined )
			parent_index = bone_index[parent.name];
		var index = out.length;
		out.push( "B" + index + "," + node.name + "," + parent_index + "," + typedArrayToArray(node.transform.getMatrix()) );
		if(node._children)
		for(var i = 0; i < node._children.length; ++i)
		{
			var child = node._children[i];
			inner_tree(child,level + 1,out);
		}
	}

	//duration in seconds, samples per second, num. samples, number of bones in the skeleton
	lines.push( [ duration.toFixed(3), sampling, total_samples, out.length ].join(",") );
	var bones_indices = [];
	for(var i = 0; i < bone_names.length; ++i)
		bones_indices.push( bone_index[ bone_names[i] ] );
	lines = lines.concat(out);
	lines.push( "@" + bones_indices.length + "," + bones_indices.join(",") );

	var offset = duration / (total_samples-1);
	for(var i = 0; i < total_samples; ++i)
	{
		var t = i*offset;
		take.applyTracks(t,t,false);
		var data = [t.toFixed(3)]
		for(var j=0; j < bones.length; ++j)
			data.push( typedArrayToArray( bones[j].transform.getMatrix()) );
		lines.push( "K" + data.flat().join(",") );
	}

	return lines.join("\n");
}


//**************** EXTRA STUFF ************************************************


//assigns the same translation to all nodes?
LS.Animation.Take.prototype.matchTranslation = function( root )
{
	var num = 0;

	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];

		if(track._type != "trans10" && track._type != "mat4")
			continue;

		if( !track._property_path || !track._property_path.length )
			continue;

		var node = LSQ.get( track._property_path[0], root );
		if(!node)
			continue;
		
		var position = node.transform.position;
		var offset = track.value_size + 1;

		var data = track.data;
		var num_samples = data.length / offset;
		if(track._type == "trans10")
		{
			for(var j = 0; j < num_samples; ++j)
				data.set( position, j*offset + 1 );
		}
		else if(track._type == "mat4")
		{
			for(var j = 0; j < num_samples; ++j)
				data.set( position, j*offset + 1 + 12 ); //12,13,14 contain translation
		}

		num += 1;
	}

	return num;
}

/**
* If this is a transform track it removes translation and scale leaving only rotations
* @method onlyRotations
*/
LS.Animation.Take.prototype.onlyRotations = function()
{
	var num = 0;

	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		if( track.onlyRotations() )
			num += 1;
	}
	return num;
}

/**
* removes scaling in transform tracks
* @method removeScaling
*/
LS.Animation.Take.prototype.removeScaling = function()
{
	var num = 0;

	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		if( track.removeScaling() )
			num += 1;
	}
	return num;
}

LS.Animation.Take.prototype.trimTracks = function( start, end )
{
	var num = 0;
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		num += track.trim( start, end );
	}

	this.duration = end - start;

	return num;
}

LS.Animation.Take.prototype.stretchTracks = function( duration )
{
	if(duration <= 0 || this.duration == 0)
		return 0;
	var scale = duration / this.duration;
	this.duration *= scale;
	for(var i = 0; i < this.tracks.length; ++i)
		this.tracks[i].stretch( scale );
	return this.tracks.length;
}


/**
* removes keyframes that are before or after the time range
* @method trim
* @param {number} start time
* @param {number} end time
*/
LS.Animation.Track.prototype.trim = function( start, end )
{
	if(this.packed_data)
		this.unpackData();

	var size = this.data.length;

	var result = [];
	for(var i = 0; i < size; ++i)
	{
		var d = this.data[i];
		if(d[0] < start || d[0] > end)
			continue;
		d[0] -= start;
		result.push(d);
	}
	this.data = result;

	//changes has been made?
	if(this.data.length != size)
		return 1;
	return 0;
}

/**
* Scales the time in every keyframe
* @method stretch
* @param {number} scale the sacle to apply to all times
*/
LS.Animation.Track.prototype.stretch = function( scale )
{
	if(this.packed_data)
		this.unpackData();
	var size = this.data.length;
	for(var i = 0; i < size; ++i)
		this.data[i][0] *= scale; //scale time
	return 1;
}

/**
* If this track changes the scale, it forces it to be 1,1,1
* @method removeScaling
*/
LS.Animation.Track.prototype.removeScaling = function()
{
	var modified = false;

	if(this.type == "matrix")
	{
		this.convertToTrans10();
		modified = true;
	}

	if( this.type != "trans10" )
	{
		if(modified)
			return true;
	}

	var num_keyframes = this.getNumberOfKeyframes();
	for( var j = 0; j < num_keyframes; ++j )
	{
		var k = this.getKeyframe(j);
		k[1][7] = k[1][8] = k[1][9] = 1; //set scale equal to 1
	}
	return true;
}


LS.Animation.Track.prototype.onlyRotations = (function()
{
	var temp = new Float32Array(10);
	var temp_quat = new Float32Array(4);

	return function(){

		//convert locator
		var path = this.property.split("/");
		var last_path = path[ path.length - 1 ];
		var old_size = this.value_size;
		if( this.type != "mat4" && this.type != "trans10" )
			return false;

		if(last_path == "matrix")
			path[ path.length - 1 ] = "Transform/rotation";
		else if (last_path == "data")
			path[ path.length - 1 ] = "rotation";

		//convert samples
		if(!this.packed_data)
			this.packData();

		this.property = path.join("/");
		var old_type = this._type;
		this.type = "quat";
		this.value_size = 4;

		var data = this.data;
		var num_samples = data.length / (old_size+1);

		if( old_type == "mat4" )
		{
			for(var k = 0; k < num_samples; ++k)
			{
				var sample = data.subarray(k*17+1,(k*17)+17);
				var new_data = LS.Transform.fromMatrix4ToTransformData( sample, temp );
				temp_quat.set( temp.subarray(3,7) );
				data[k*5] = data[k*17]; //timestamp
				data.set( temp_quat, k*5+1); //overwrite inplace (because the output is less big that the input)
			}
		}
		else if( old_type == "trans10" )
		{
			for(var k = 0; k < num_samples; ++k)
			{
				var sample = data.subarray(k*11+4,(k*11)+8);
				data[k*5] = data[k*11]; //timestamp
				data.set( sample, k*5+1); //overwrite inplace (because the output is less big that the input)
			}
		}
		
		this.data = new Float32Array( data.subarray(0,num_samples*5) );
		return true;
	};
})();