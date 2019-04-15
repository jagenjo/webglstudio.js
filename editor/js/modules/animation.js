var AnimationModule = {
	name: "Timeline",
	enabled: true,

	render_helpers: true,
	//settings_panel: [{name:"renderer", title:"Renderer", icon:null }],

	_trajectories: [],

	init: function()
	{
		//create the timeline
		this.tab = InterfaceModule.lower_tabs_widget.addWidgetTab( Timeline );
		this.timeline = this.tab.widget;

		LEvent.bind( LS.GlobalScene, "afterRenderScene", this.renderView.bind(this));
		LEvent.bind( LS.GlobalScene, "renderPicking", this.renderPicking.bind(this));

		RenderModule.canvas_manager.addWidget( AnimationModule ); //capture update, render trajectories
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

	attachKeyframesBehaviour: function( inspector )
	{
		var elements = inspector.root.querySelectorAll(".keyframe_icon");
		for(var i = 0; i < elements.length; i++)
		{
			var element = elements[i];
			element.draggable = true;
			element.addEventListener("click", inner_click );
			element.addEventListener("contextmenu", (function(e) { 
				if(e.button != 2) //right button
					return false;
				inner_rightclick(e);
				e.preventDefault();
				e.stopPropagation();
				return false;
			}).bind(this));
			element.addEventListener("dragstart", inner_dragstart );
			element.addEventListener("drop", inner_drop );
		}

		function inner_click( e )
		{
			AnimationModule.insertKeyframe( e.target, e.shiftKey );
			e.preventDefault();
			e.stopPropagation();
			return true;
		}

		function inner_rightclick( e )
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
		}

		function inner_dragstart(e)
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
		}

		function inner_drop(e)
		{
			var element = EditorModule.getSceneElementFromDropEvent(e);
			//something to do?
		}

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
			widgets.addList( null, takes, { height: 140, selected: selected_take_name, callback: function(v){
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
			//"Pack all tracks","Unpack all tracks","Use names as ids","Optimize Tracks","Match Translation","Only Rotations"

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
