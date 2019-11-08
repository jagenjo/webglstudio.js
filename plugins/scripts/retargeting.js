//used to do retargeting with animations
var Retargeting = {

	name: "Retargeting",
	preferences: {
	},

	init: function()
	{
		LiteGUI.menubar.add("Window/Retargeting", { callback: function() { Retargeting.showRetargetingDialog(); }});
		if(window.Timeline)
			LEvent.bind( Timeline, "options_menu", this.onTimelineOptions.bind(this) );


		LiteGUI.addCSS("\
			.nodelist .item { background-color: #222; border-radius: 2px, margin: 4px; padding: 4px; } \n\
			.nodelist .item span { display: inline-block; width: 100px; } \n\
		");
	},

	onTimelineOptions: function( options )
	{
		console.log(options);	
		var that = this;
		options.push({ title: "Retargeting", callback: function( item, timeline ){
			console.log(item,timeline);
			that.showRetargetingDialog( timeline.current_animation );
		}});
	},

	showRetargetingDialog: function( animation )
	{
		animation = animation || "";

		var dialog = new LiteGUI.Dialog({ title:'Retargeting', fullcontent:true, width: 600, height: 500, closable: true, minimize: true, resizable: true, draggable: true });

		var area = new LiteGUI.Area(null,{ size: "100%" });
		dialog.add(area);
		area.split("horizontal",["50%",null]);
		area.root.style.height = "calc( 100% - 20px )";

		var inspector = new LiteGUI.Inspector({ name_width: 140 });
		area.getSection(0).add( inspector );

		var inspector_right = new LiteGUI.Inspector({ name_width: 140 });
		area.getSection(1).add( inspector_right );
		inspector_right.addTitle("Track Node names");
		var container = inspector_right.addContainer("nodenames",{ height: 280 });
		container.classList.add( "nodelist" );
		container.style.backgroundColor = "#111";
		inspector_right.addButton(null,"Update", update_right );

		var that = this;

		var root_node = null;
		var take_name = "default";
		var takes = ["default"];
		var animation_name = "";
		if( animation )
		{
			animation_name = animation.fullpath || animation.filename;
			takes = Object.keys( animation.takes );
		}
		var options = {
			remove_translations: true,
			adapt_hips_motion: true
		};

		inspector.addTitle("Animation");
		var anim_widget = inspector.addAnimation( "Filename", animation_name, function(v){ 
			if(!v) return;
			if(v.constructor === String)
				animation = LS.ResoucesManager.resources[v];
			else
				animation = v;
			if(animation)
				return;
			takes = Object.keys( animation.takes );
			take_widget.setValues( takes );
			take_name = "default";
			take_widget.setValue( take_name );
			update_right();
		});
		var take_widget = inspector.addCombo( "Take", take_name, { values: takes, callback: function(v){ 
			if(v == take_name)
				return;
			take_name = v;
			if(animation)
				take = animation.getTake( take_name );
			update_right();
		}});
		inspector.addTitle("Skeleton");
		inspector.addNode("Root node",root_node, { callback: function(v) { root_node = v; update_right(); }});
		inspector.addTitle("Actions");
		inspector.addCheckbox("Remove translations",options.remove_translations, function(v){ options.remove_translations = v; });
		inspector.addCheckbox("Adapt Hips motion",options.remove_translations, function(v){ options.remove_translations = v; });

		inspector.addSeparator();
		inspector.addStringButton("Replace Tracks Prefix","", { button:"Go", callback: function(v){
			take.replacePrefix(v);
			update_right();
		}});

		inspector.addSeparator();
		inspector.addButton(null,"Apply Retargeting", function(){
			var take = animation.takes[ take_name ];
			if(!take)
				return;
			that.applyRetargeting( take, root_node, options );
			LS.ResourcesManager.resourceModified( animation );
			update_right();
		});

		update_right();

		function update_right()
		{
			container.innerHTML = "";
			if(!animation)
				return;
			var take = animation.takes[ take_name ];
			if(!take)
				return;

			for(var i = 0; i < take.tracks.length; ++i)
			{
				var track = take.tracks[i];
				var nodename = track._property_path[0];
				var elem = LiteGUI.createElement("div",".item","<span class='tracknode'></span> &#x2192; <span class='meshnode'></span>");
				elem.querySelector(".tracknode").innerText = nodename;

				var node = null;
				if(root_node)
				{
					var sk_node = root_node.findNodeByName(nodename);
					var meshnode = elem.querySelector(".meshnode");
					meshnode.innerText = sk_node ? sk_node.name : "[not found]";
					if(!sk_node)
						meshnode.style.opacity = 0.5;
				}

				container.appendChild(elem);
			}
		}

		dialog.show();
		dialog.adjustSize();
	},

	applyRetargeting: function( take, skeleton_node, options )
	{
		//fetch hips track
		var hips_track = null;
		for(var i = 0; i < take.tracks.length; ++i)
		{
			var track = take.tracks[i];
			if( track._property_path[0] != "Hips" || track.type == "quat" )
				continue;
			hips_track = track;
			break;
		}

		if(!hips_track)
		{
			alert("no Hips node found");
			return;
		}

		//remove translations or scales
		var hips_name = hips_track._property_path[0];
		hips_track.enabled = false;
		take.onlyRotations();
		hips_track.enabled = true;
		hips_track.unpackData();

		//adapt hips motion
		//get anim node
		var anim_node = hips_track.getPropertyNode();
		var anim_hips_height = 1;
		if(anim_node && 0)
			anim_hips_height = anim_node.transform.getGlobalPosition()[1];
		else
			anim_hips_height = hips_track.data[0][1][1]; //y

		var sk_hips = skeleton_node.name == hips_name ? skeleton_node : skeleton_node.findNodeByName( hips_name );

		if(sk_hips)
		{
			var sk_hips_pos = anim_node.transform.getGlobalPosition();
			var iscale = anim_hips_height / sk_hips_pos[1];
			for(var i = 0; i < hips_track.data.length; ++i)
			{
				var keyframe = hips_track.data[i];
				if(hips_track.type == "vec3")
					vec3.scale( keyframe[1], keyframe[1], iscale );
			}
		}


		return true;
	}
};

Retargeting.init();